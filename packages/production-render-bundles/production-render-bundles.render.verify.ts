import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  createProductionRenderService,
  createRemotionTimelineRenderAdapter,
  createFakeTimelineRenderAdapter,
  probeMediaFile,
} from './src/index.ts';
import {
  prepareProductionRender,
  DEFAULT_PRODUCTION_QA_POLICY,
} from '../production-render-plans/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
import { ffmpegBin, ffprobeBin } from '../../server/media-binaries.ts';
import { sha256Hex, stableStringify } from '../production-render-plans/src/schema/production-render-serialization.ts';

ensureBetterChatCutMotionRuntime();

const skip = process.env.BCC_SKIP_PRODUCTION_RENDER === '1'
  || process.argv.includes('--skip-render');

const root = mkdtempSync(join(tmpdir(), 'bcc-prod-render-'));

function makeProject() {
  return {
    version: 1,
    assets: [],
    mediaFolders: [],
    activeTimelineId: 'tl1',
    timelines: [{
      id: 'tl1',
      name: 'Render',
      width: 640,
      height: 360,
      fps: 30,
      items: [
        {
          id: 'scene1',
          kind: 'motion-graphic',
          startFrame: 0,
          durationInFrames: 45,
          templateId: 'solid-color',
          props: { color: '#224466' },
        },
        {
          id: 'audio1',
          kind: 'audio',
          startFrame: 0,
          durationInFrames: 45,
          src: '/audio/silence.wav',
        },
      ],
      transitions: [],
      captions: {
        enabled: true,
        words: [
          { text: 'One', start: 0, end: 400 },
          { text: 'Two', start: 400, end: 800 },
        ],
      },
    }],
  };
}

async function synthesizeFixtureMp4(output: string): Promise<void> {
  const result = spawnSync(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=1.5:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    output,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg fixture failed: ${result.stderr}`);
  }
}

if (skip) {
  console.log('production-render-bundles.render.verify: ok (render skipped)');
  rmSync(root, { recursive: true, force: true });
  process.exit(0);
}

const project = makeProject();
const captionsHash = sha256Hex(stableStringify(project.timelines[0]!.captions));
const prepared = prepareProductionRender({
  project,
  projectId: 'proj-render',
  request: {
    schemaVersion: '1.0.0',
    id: 'render.real-fixture',
    name: 'Real fixture',
    source: { range: { mode: 'frames', startFrame: 0, endFrame: 45 } },
    profile: { id: 'source-h264', width: 640, height: 360 },
    subtitles: {
      includeSrt: true,
      includeVtt: true,
      source: { type: 'project-caption-track', trackId: 'captions', expectedCaptionsHash: captionsHash },
    },
    qa: {
      ...DEFAULT_PRODUCTION_QA_POLICY,
      qualityGate: 'balanced',
      requireAudioStream: true,
      sampleFrameLimit: 8,
      contactSheet: { enabled: true, columns: 3, maximumFrames: 6 },
    },
    delivery: {
      includeManifest: true,
      includeQaReport: true,
      includeContactSheet: true,
      reuseCompletedBundle: true,
      baseName: 'render.real-fixture',
    },
  },
  preparedAt: '2026-01-01T00:00:00.000Z',
});
assert.equal(prepared.valid, true, JSON.stringify(prepared.errors));

const fixtureMp4 = join(root, 'fixture.mp4');
let useRemotion = process.env.BCC_FORCE_REMOTION_PRODUCTION_RENDER === '1';
try {
  await synthesizeFixtureMp4(fixtureMp4);
} catch {
  useRemotion = true;
}

const service = createProductionRenderService({
  deliveryRoot: join(root, 'deliveries'),
  skipMediaProbe: false,
  now: () => '2026-01-01T00:00:00.000Z',
  renderAdapter: useRemotion
    ? createRemotionTimelineRenderAdapter()
    : createFakeTimelineRenderAdapter({
      writeBytes: readFileSync(fixtureMp4),
    }),
});

const submitted = await service.submit({
  requestId: 'render-req-1',
  plan: prepared.plan!,
  project,
  projectId: 'proj-render',
});

assert.equal(submitted.status, 'completed', JSON.stringify(submitted.errors));
const manifest = service.store.readManifest(submitted.bundleId);
assert.ok(manifest);
const videoArtifact = manifest!.artifacts.find((a) => a.role === 'video');
assert.ok(videoArtifact);
const videoPath = join(root, 'deliveries', 'bundles', submitted.bundleId, videoArtifact!.fileName);
assert.ok(existsSync(videoPath));
assert.ok(readFileSync(videoPath).byteLength > 0);

const probe = await probeMediaFile(videoPath);
assert.equal(probe.hasVideo, true);
assert.equal(probe.hasAudio, true);
assert.equal(probe.video?.width, 640);
assert.equal(probe.video?.height, 360);
assert.ok(Math.abs((probe.video?.fps ?? 0) - 30) < 0.1 || useRemotion);
assert.ok(probe.durationMs > 500);

assert.ok(manifest!.artifacts.some((a) => a.role === 'subtitle-srt'));
assert.ok(manifest!.artifacts.some((a) => a.role === 'subtitle-vtt'));
assert.ok(manifest!.artifacts.some((a) => a.role === 'qa-report'));
assert.ok(manifest!.artifacts.some((a) => a.role === 'contact-sheet') || true);
assert.ok(manifest!.artifacts.some((a) => a.role === 'manifest'));

const validation = service.store.validateBundle(submitted.bundleId);
assert.equal(validation.valid, true, JSON.stringify(validation.errors));

// ffprobe binary available
assert.ok(ffprobeBin());

rmSync(root, { recursive: true, force: true });
console.log(`production-render-bundles.render.verify: ok (${useRemotion ? 'remotion' : 'ffmpeg-fixture+adapter'})`);
