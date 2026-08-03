import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PRODUCTION_RENDER_CONTROL_TOOLS,
  runProductionRenderControlTool,
  setProductionRenderServiceForTests,
} from './production-render-tools.ts';
import {
  createProductionRenderService,
  createFakeTimelineRenderAdapter,
} from '../../../packages/production-render-bundles/src/index.ts';
import { prepareProductionRender, DEFAULT_PRODUCTION_QA_POLICY } from '../../../packages/production-render-plans/src/index.ts';
import { sha256Hex, stableStringify } from '../../../packages/production-render-plans/src/schema/production-render-serialization.ts';
import { setStoredEntry } from '../../plugins/project-store.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-prod-mcp-'));
const projectId = 'proj-mcp-prod-1';

const project = {
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
      { id: 'a1', kind: 'audio', startFrame: 0, durationInFrames: 30, src: '/media/uploads/t.wav' },
    ],
    captions: { enabled: true, words: [{ text: 'Hello', start: 0, end: 400 }] },
  }],
};

await setStoredEntry(`project:${projectId}`, project);

setProductionRenderServiceForTests(createProductionRenderService({
  deliveryRoot: root,
  skipMediaProbe: true,
  now: () => '2026-01-01T00:00:00.000Z',
  renderAdapter: createFakeTimelineRenderAdapter({ writeBytes: Buffer.alloc(2048, 2) }),
}));

assert.deepEqual(
  PRODUCTION_RENDER_CONTROL_TOOLS.map((t) => t.name),
  [
    'production_render_get_contract',
    'production_render_prepare',
    'production_render_submit',
    'production_render_status',
    'production_render_cancel',
    'production_render_list',
    'production_render_get_manifest',
    'production_render_validate_bundle',
  ],
);

const contract = await runProductionRenderControlTool('production_render_get_contract', { format: 'full' }) as {
  schemaVersion: string;
  tools: string[];
};
assert.equal(contract.schemaVersion, '1.0.0');
assert.ok(contract.tools.includes('production_render_submit'));

const captionsHash = sha256Hex(stableStringify(project.timelines[0]!.captions));
const prepared = await runProductionRenderControlTool('production_render_prepare', {
  projectId,
  request: {
    schemaVersion: '1.0.0',
    id: 'render.mcp-fixture',
    name: 'MCP fixture',
    source: { range: { mode: 'full-timeline' } },
    profile: { id: 'preview-720p-h264' },
    subtitles: {
      includeSrt: true,
      includeVtt: true,
      source: { type: 'project-caption-track', trackId: 'captions', expectedCaptionsHash: captionsHash },
    },
    qa: { ...DEFAULT_PRODUCTION_QA_POLICY, contactSheet: { enabled: false, columns: 2, maximumFrames: 4 } },
    delivery: {
      includeManifest: true,
      includeQaReport: true,
      includeContactSheet: false,
      reuseCompletedBundle: true,
      baseName: 'render.mcp-fixture',
    },
  },
}, { projectId }) as { valid: boolean; plan?: { planHash: string; bundleId: string }; errors: unknown[] };

assert.equal(prepared.valid, true, JSON.stringify(prepared.errors));
assert.ok(prepared.plan);

const submitted = await runProductionRenderControlTool('production_render_submit', {
  projectId,
  requestId: 'mcp-req-1',
  plan: prepared.plan,
}, { projectId }) as { status: string; operationId: string; bundleId: string };
assert.equal(submitted.status, 'completed', JSON.stringify(submitted));

const status = await runProductionRenderControlTool('production_render_status', {
  operationId: submitted.operationId,
}) as { operation: { status: string }; bundle?: { artifacts: unknown[] } };
assert.equal(status.operation.status, 'completed');
assert.ok(status.bundle?.artifacts);

const list = await runProductionRenderControlTool('production_render_list', { limit: 10, offset: 0 }) as {
  operations: unknown[];
};
assert.ok(list.operations.length >= 1);

const manifest = await runProductionRenderControlTool('production_render_get_manifest', {
  bundleId: submitted.bundleId,
}) as { valid: boolean; manifest: { artifacts: Array<{ downloadUrl: string }> } };
assert.equal(manifest.valid, true);
assert.ok(manifest.manifest.artifacts.every((a) => a.downloadUrl.startsWith('/api/better-chat-cut/deliveries/')));
assert.ok(!JSON.stringify(manifest).includes(root));

const validated = await runProductionRenderControlTool('production_render_validate_bundle', {
  bundleId: submitted.bundleId,
}) as { valid: boolean };
assert.equal(validated.valid, true);

// prepare must not require mutation path
void prepareProductionRender;

setProductionRenderServiceForTests(null);
rmSync(root, { recursive: true, force: true });
console.log('production-render-tools.verify: ok');
