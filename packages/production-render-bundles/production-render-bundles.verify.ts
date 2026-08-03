import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createProductionRenderService,
  createFakeTimelineRenderAdapter,
  selectProductionQaFrames,
  evaluateQualityGate,
  parseSrt,
  parseVtt,
  computeDeliveryManifestHash,
} from './src/index.ts';
import {
  prepareProductionRender,
  DEFAULT_PRODUCTION_QA_POLICY,
  type ProductionRenderRequestV1,
} from '../production-render-plans/src/index.ts';
import { serializeSrt, serializeWebVtt } from '../project-narration/src/subtitles/subtitle-cues.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-delivery-'));

function sampleProject() {
  return {
    version: 1,
    assets: [],
    mediaFolders: [],
    activeTimelineId: 'tl1',
    timelines: [{
      id: 'tl1',
      name: 'Main',
      width: 640,
      height: 360,
      fps: 30,
      items: [
        { id: 'v1', kind: 'motion-graphic', startFrame: 0, durationInFrames: 30, templateId: 'x' },
        { id: 'a1', kind: 'audio', startFrame: 0, durationInFrames: 30, src: '/media/uploads/tone.wav' },
      ],
      captions: { enabled: true, words: [{ text: 'Hello', start: 0, end: 400 }] },
    }],
  };
}

function sampleRequest(overrides: Partial<ProductionRenderRequestV1> = {}): ProductionRenderRequestV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'render.unit-fixture',
    name: 'Unit fixture',
    source: { range: { mode: 'full-timeline' } },
    profile: { id: 'preview-720p-h264' },
    subtitles: {
      includeSrt: true,
      includeVtt: true,
      source: {
        type: 'project-caption-track',
        trackId: 'captions',
        expectedCaptionsHash: '', // filled below
      },
    },
    qa: {
      ...DEFAULT_PRODUCTION_QA_POLICY,
      requireAudioStream: true,
      contactSheet: { enabled: false, columns: 3, maximumFrames: 6 },
    },
    delivery: {
      includeManifest: true,
      includeQaReport: true,
      includeContactSheet: false,
      reuseCompletedBundle: true,
      baseName: 'render.unit-fixture',
    },
    ...overrides,
  };
}

// Frame sampling
{
  const frames = selectProductionQaFrames({
    startFrame: 0,
    endFrame: 100,
    timelineFps: 30,
    sceneBoundaries: [0, 40, 80],
    transitionFrames: [39],
    captionFrames: [10],
    maximumFrames: 8,
  });
  assert.equal(frames[0], 0);
  assert.equal(frames[frames.length - 1], 99);
  assert.ok(frames.length <= 8);
  assert.deepEqual(frames, [...frames].sort((a, b) => a - b));
  assert.deepEqual(
    selectProductionQaFrames({ startFrame: 0, endFrame: 100, timelineFps: 30, maximumFrames: 8 }),
    selectProductionQaFrames({ startFrame: 0, endFrame: 100, timelineFps: 30, maximumFrames: 8 }),
  );
}

// Subtitle parse
{
  const cues = [{ index: 1, startMs: 0, endMs: 500, text: 'Hi 你好' }];
  const srt = serializeSrt(cues);
  const vtt = serializeWebVtt(cues);
  assert.ok(parseSrt(srt).cues.length === 1);
  assert.ok(parseVtt(vtt).cues.length === 1);
  assert.ok(parseSrt(srt).cues[0]!.text.includes('你好'));
}

// Quality gate
{
  const passed = evaluateQualityGate({
    checks: [{ id: 'video.stream', category: 'video', status: 'passed', message: 'ok' }],
    errors: [],
  }, DEFAULT_PRODUCTION_QA_POLICY);
  assert.equal(passed.pass, true);
  const failed = evaluateQualityGate({
    checks: [{ id: 'video.stream', category: 'video', status: 'failed', message: 'missing' }],
    errors: [],
  }, DEFAULT_PRODUCTION_QA_POLICY);
  assert.equal(failed.pass, false);
}

// Operation lifecycle with fake renderer
{
  const { sha256Hex, stableStringify } = await import('../production-render-plans/src/schema/production-render-serialization.ts');
  const project = sampleProject();
  const captionsHash = sha256Hex(stableStringify(project.timelines[0]!.captions));
  const request = sampleRequest({
    subtitles: {
      includeSrt: true,
      includeVtt: true,
      source: { type: 'project-caption-track', trackId: 'captions', expectedCaptionsHash: captionsHash },
    },
  });
  const prepared = prepareProductionRender({ project, projectId: 'proj-unit', request, preparedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(prepared.valid, true, JSON.stringify(prepared.errors));

  let renderedSnapshot: unknown;
  const service = createProductionRenderService({
    deliveryRoot: root,
    skipMediaProbe: true,
    now: () => '2026-01-01T00:00:00.000Z',
    createOperationId: undefined,
    renderAdapter: createFakeTimelineRenderAdapter({
      onRender: (input) => { renderedSnapshot = input.projectSnapshot; },
      writeBytes: Buffer.alloc(2048, 1),
    }),
    store: undefined,
  });
  // recreate with deterministic op ids via store options
  const service2 = createProductionRenderService({
    deliveryRoot: root,
    skipMediaProbe: true,
    now: () => '2026-01-01T00:00:00.000Z',
    renderAdapter: createFakeTimelineRenderAdapter({
      onRender: (input) => { renderedSnapshot = input.projectSnapshot; },
      writeBytes: Buffer.alloc(2048, 1),
    }),
  });

  const submitted = await service2.submit({
    requestId: 'req-unit-1',
    plan: prepared.plan!,
    project,
    projectId: 'proj-unit',
  });
  assert.equal(submitted.status, 'completed', JSON.stringify(submitted.errors));
  assert.equal(submitted.reusedCompletedBundle, false);
  assert.ok(renderedSnapshot);
  assert.ok(service2.store.bundleExists(prepared.plan!.bundleId));
  const manifest = service2.store.readManifest(prepared.plan!.bundleId);
  assert.ok(manifest);
  assert.ok(manifest!.artifacts.some((a) => a.role === 'video'));
  assert.ok(manifest!.artifacts.some((a) => a.role === 'subtitle-srt'));
  assert.ok(manifest!.artifacts.some((a) => a.role === 'subtitle-vtt'));
  assert.ok(!JSON.stringify(manifest).includes(root), 'manifest must not expose absolute paths');

  const replay = await service2.submit({
    requestId: 'req-unit-1',
    plan: prepared.plan!,
    project,
    projectId: 'proj-unit',
  });
  assert.equal(replay.replayed, true);

  const reuse = await service2.submit({
    requestId: 'req-unit-2',
    plan: prepared.plan!,
    project,
    projectId: 'proj-unit',
  });
  assert.equal(reuse.reusedCompletedBundle, true);
  assert.equal(reuse.status, 'completed');

  // Fingerprint conflict
  const mutated = structuredClone(project);
  mutated.timelines[0]!.items[0]!.durationInFrames = 45;
  let conflict = false;
  try {
    await service2.submit({
      requestId: 'req-unit-3',
      plan: prepared.plan!,
      project: mutated,
      projectId: 'proj-unit',
    });
  } catch (error) {
    conflict = error instanceof Error && error.message.includes('fingerprint') || String((error as { code?: string }).code ?? '').includes('FINGERPRINT');
    assert.equal((error as { code: string }).code, 'PRODUCTION_RENDER_PROJECT_FINGERPRINT_CONFLICT');
    conflict = true;
  }
  assert.equal(conflict, true);

  // Draft source rejected
  let draftBlocked = false;
  try {
    await service2.submit({
      requestId: 'req-unit-4',
      plan: prepared.plan!,
      project,
      projectId: 'proj-unit',
      sourceMode: 'edit-session-draft',
    });
  } catch (error) {
    assert.equal((error as { code: string }).code, 'PRODUCTION_RENDER_DRAFT_SOURCE_NOT_ALLOWED');
    draftBlocked = true;
  }
  assert.equal(draftBlocked, true);

  // Path traversal operation id
  let pathBlocked = false;
  try {
    service2.store.readOperation('../etc');
  } catch (error) {
    assert.equal((error as { code: string }).code, 'PRODUCTION_RENDER_PATH_TRAVERSAL');
    pathBlocked = true;
  }
  assert.equal(pathBlocked, true);

  // Bundle validation
  const validation = service2.store.validateBundle(prepared.plan!.bundleId);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  // Corrupt bundle detection
  const bundlePath = join(root, 'bundles', prepared.plan!.bundleId, `${prepared.plan!.delivery.baseName}.mp4`);
  writeFileSync(bundlePath, Buffer.from('corrupted'));
  const corrupt = service2.store.validateBundle(prepared.plan!.bundleId);
  assert.equal(corrupt.valid, false);
  assert.equal(corrupt.artifactHashesValid, false);

  // Cancel completed rejected
  const cancel = service2.cancel(submitted.operationId);
  assert.ok(cancel.errors.some((e) => e.code === 'PRODUCTION_RENDER_ALREADY_COMPLETED'));

  void service;
  void computeDeliveryManifestHash;
  void existsSync;
  void readFileSync;
}

rmSync(root, { recursive: true, force: true });
console.log('production-render-bundles.verify: ok');
