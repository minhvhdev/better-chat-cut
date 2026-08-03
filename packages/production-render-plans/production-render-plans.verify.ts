import assert from 'node:assert/strict';
import {
  validateProductionRenderRequest,
  computeProductionRenderRequestHash,
  computeProductionRenderPlanHash,
  computeProductionRenderRevision,
  computeProductionProjectFingerprint,
  computeProductionTimelineFingerprint,
  computeBundleId,
  prepareProductionRender,
  DEFAULT_PRODUCTION_QA_POLICY,
  PRODUCTION_RENDER_REVISION,
  type ProductionRenderRequestV1,
} from './src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
ensureBetterChatCutMotionRuntime();

function sampleRequest(overrides: Partial<ProductionRenderRequestV1> = {}): ProductionRenderRequestV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'render.hawking-radiation',
    name: 'Hawking radiation delivery',
    source: { range: { mode: 'full-timeline' } },
    profile: { id: 'preview-720p-h264' },
    subtitles: { includeSrt: false, includeVtt: false, source: { type: 'none' } },
    qa: { ...DEFAULT_PRODUCTION_QA_POLICY, qualityGate: 'balanced' },
    delivery: { includeManifest: true, includeQaReport: true, includeContactSheet: true, reuseCompletedBundle: true, baseName: 'render.hawking-radiation' },
    ...overrides,
  };
}

// Schema validation
{
  const ok = validateProductionRenderRequest(sampleRequest());
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  assert.ok(ok.requestHash);
  assert.equal(ok.productionRenderRevision, PRODUCTION_RENDER_REVISION);

  const badId = validateProductionRenderRequest(sampleRequest({ id: 'BAD ID' }));
  assert.equal(badId.valid, false);
  assert.ok(badId.errors.some((e) => e.code === 'PRODUCTION_RENDER_INVALID_ID'));

  const emptyName = validateProductionRenderRequest({ ...sampleRequest(), name: '' });
  assert.equal(emptyName.valid, false);

  const badRange = validateProductionRenderRequest(sampleRequest({
    source: { range: { mode: 'frames', startFrame: 10, endFrame: 5 } },
  }));
  assert.equal(badRange.valid, false);
  assert.ok(badRange.errors.some((e) => e.code === 'PRODUCTION_RENDER_RANGE_INVALID'));

  const pathTraversal = validateProductionRenderRequest(sampleRequest({
    delivery: { includeManifest: true, includeQaReport: true, includeContactSheet: true, reuseCompletedBundle: true, baseName: '../etc/passwd' },
  }));
  assert.equal(pathTraversal.valid, false);

  const unknown = validateProductionRenderRequest({ ...sampleRequest(), extra: true } as never);
  assert.equal(unknown.valid, false);

  const codec = validateProductionRenderRequest({
    ...sampleRequest(),
    profile: { id: 'youtube-1080p-h264', ffmpegArgs: '-crf 18' } as never,
  });
  assert.equal(codec.valid, false);
}

// Hashes
{
  const a = sampleRequest();
  const b = sampleRequest();
  assert.equal(computeProductionRenderRequestHash(a), computeProductionRenderRequestHash(b));
  const shuffled = JSON.parse(JSON.stringify(a));
  // property order should not matter via stable stringify after normalize
  assert.equal(
    computeProductionRenderRequestHash(validateProductionRenderRequest(shuffled).normalizedRequest!),
    computeProductionRenderRequestHash(validateProductionRenderRequest(a).normalizedRequest!),
  );
  assert.equal(computeProductionRenderRevision(), PRODUCTION_RENDER_REVISION);
  assert.equal(computeBundleId('render.hawking-radiation', 'abcdef0123456789'), 'delivery.hawking-radiation.abcdef01');
}

// Fingerprints + prepare
{
  const project = {
    version: 1,
    assets: [],
    mediaFolders: [],
    activeTimelineId: 'tl1',
    timelines: [{
      id: 'tl1',
      name: 'Main',
      width: 1280,
      height: 720,
      fps: 30,
      items: [
        { id: 'clip1', kind: 'motion-graphic', startFrame: 0, durationInFrames: 60, templateId: 'other' },
      ],
      selectedId: 'clip1',
      selectedIds: ['clip1'],
    }],
  };
  const fp1 = computeProductionProjectFingerprint(project);
  const fp2 = computeProductionProjectFingerprint({
    ...project,
    timelines: [{ ...project.timelines[0]!, selectedId: null, selectedIds: [] }],
  });
  assert.equal(fp1, fp2, 'UI selection must not affect project fingerprint');

  const tf1 = computeProductionTimelineFingerprint(project.timelines[0]);
  const tf2 = computeProductionTimelineFingerprint({ ...project.timelines[0]!, selectedId: 'x' });
  assert.equal(tf1, tf2);

  const prepared = prepareProductionRender({
    project,
    projectId: 'proj-1',
    request: sampleRequest(),
    preparedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(prepared.valid, true, JSON.stringify(prepared.errors));
  assert.ok(prepared.plan);
  assert.equal(prepared.plan!.source.range.startFrame, 0);
  assert.equal(prepared.plan!.source.range.endFrame, 60);
  assert.equal(prepared.plan!.profile.width, 1280);
  assert.equal(prepared.plan!.profile.height, 720);
  assert.ok(prepared.plan!.planHash);
  assert.ok(prepared.plan!.bundleId.startsWith('delivery.hawking-radiation.'));

  const again = prepareProductionRender({
    project,
    projectId: 'proj-1',
    request: sampleRequest(),
    preparedAt: '2099-01-01T00:00:00.000Z',
  });
  assert.equal(again.plan!.planHash, prepared.plan!.planHash, 'preparedAt must not affect plan hash');

  const empty = prepareProductionRender({
    project: { ...project, timelines: [{ ...project.timelines[0]!, items: [] }] },
    projectId: 'proj-1',
    request: sampleRequest(),
  });
  assert.equal(empty.valid, false);
  assert.ok(empty.errors.some((e) => e.code === 'PRODUCTION_RENDER_TIMELINE_EMPTY'));

  const mutated = structuredClone(project);
  prepareProductionRender({ project: mutated, projectId: 'proj-1', request: sampleRequest() });
  assert.deepEqual(mutated, project, 'prepare must not mutate project');
}

// Frame range + subtitle source requirement
{
  const project = {
    version: 1,
    assets: [],
    mediaFolders: [],
    activeTimelineId: 'tl1',
    timelines: [{
      id: 'tl1',
      width: 1280,
      height: 720,
      fps: 30,
      items: [{ id: 'c', kind: 'video', startFrame: 0, durationInFrames: 90 }],
    }],
  };
  const frames = prepareProductionRender({
    project,
    projectId: 'p',
    request: sampleRequest({ source: { range: { mode: 'frames', startFrame: 10, endFrame: 40 } } }),
  });
  assert.equal(frames.valid, true, JSON.stringify(frames.errors));
  assert.equal(frames.plan!.source.range.durationInFrames, 30);

  const overflow = prepareProductionRender({
    project,
    projectId: 'p',
    request: sampleRequest({ source: { range: { mode: 'frames', startFrame: 0, endFrame: 200 } } }),
  });
  assert.equal(overflow.valid, false);

  const needsSubs = prepareProductionRender({
    project,
    projectId: 'p',
    request: sampleRequest({
      subtitles: { includeSrt: true, includeVtt: true, source: { type: 'none' } },
    }),
  });
  assert.equal(needsSubs.valid, false);
  assert.ok(needsSubs.errors.some((e) => e.code === 'PRODUCTION_RENDER_CAPTION_SOURCE_INVALID'));
}

// Narration timing path (no applied narration → not found)
{
  const timingSnapshot = {
    schemaVersion: '1.0.0' as const,
    narrationPlanId: 'narration.hawking-radiation',
    narrationPlanHash: 'abc',
    timingHash: 'timing-1',
    source: { type: 'temporary-tts' as const },
    fps: 30,
    scenes: [],
    captionWords: [{ text: 'Hello', start: 0, end: 400 }],
    captionPolicy: { enabled: true, pacing: 'phrase' as const },
  };
  const project = {
    version: 1,
    assets: [],
    mediaFolders: [],
    activeTimelineId: 'tl1',
    timelines: [{
      id: 'tl1',
      width: 1280,
      height: 720,
      fps: 30,
      items: [{ id: 'c', kind: 'video', startFrame: 0, durationInFrames: 90 }],
    }],
  };
  const missingNarr = prepareProductionRender({
    project,
    projectId: 'p',
    request: sampleRequest({
      subtitles: {
        includeSrt: true,
        includeVtt: true,
        source: { type: 'narration-timing', timingSnapshot: timingSnapshot as never },
      },
    }),
  });
  assert.equal(missingNarr.valid, false);
  assert.ok(missingNarr.errors.some((e) => e.code === 'PRODUCTION_RENDER_NARRATION_NOT_FOUND'));
}

console.log('production-render-plans.verify: ok');
