import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PUBLISHING_CONTROL_TOOLS,
  runPublishingControlTool,
  setPublishingOrchestratorForTests,
} from './publishing-tools.ts';
import {
  createPublishingOrchestrator,
  createPublishingRunStore,
  createFakePublishingAdapter,
  createFakeDeliverySource,
} from '../../../packages/publishing-operations/src/index.ts';

const REQUIRED = [
  'publishing_get_contract',
  'publishing_connection_inspect',
  'publishing_package_validate',
  'publishing_run_create',
  'publishing_run_list',
  'publishing_run_get',
  'publishing_run_validate',
  'publishing_run_put_artifact',
  'publishing_run_plan_next',
  'publishing_run_execute_stage',
  'publishing_run_review',
  'publishing_run_resume',
  'publishing_run_cancel',
  'publishing_run_get_release',
];

assert.equal(PUBLISHING_CONTROL_TOOLS.length, 14);
for (const name of REQUIRED) {
  assert.ok(PUBLISHING_CONTROL_TOOLS.some((t) => t.name === name), name);
}

const root = mkdtempSync(join(tmpdir(), 'bcc-pub-mcp-'));
process.env.BETTER_CHAT_CUT_PUBLISHING_ROOT = root;
process.env.BETTER_CHAT_CUT_PUBLISHING_SKIP_THUMBNAIL_RENDER = '1';

const orch = createPublishingOrchestrator({
  store: createPublishingRunStore({ root }),
  adapter: createFakePublishingAdapter({ channelId: 'UCTESTCHANNEL' }),
  deliverySource: createFakeDeliverySource(),
  skipThumbnailRender: true,
});
setPublishingOrchestratorForTests(orch);

function unwrap(result: unknown): Record<string, unknown> {
  const r = result as { structuredContent?: Record<string, unknown> };
  assert.ok(r.structuredContent);
  return r.structuredContent;
}

const contract = unwrap(await runPublishingControlTool('publishing_get_contract', { format: 'summary' }));
assert.ok(Array.isArray(contract.tools));
assert.equal((contract.tools as string[]).length, 14);

const insp = unwrap(await runPublishingControlTool('publishing_connection_inspect', {
  target: { platform: 'youtube', connectionId: 'conn.youtube.main', expectedChannelId: 'UCTESTCHANNEL' },
}));
assert.equal(insp.platform, 'youtube');
assert.ok(!JSON.stringify(insp).includes('token'));

const dryCreate = unwrap(await runPublishingControlTool('publishing_run_create', {
  requestId: 'mcp.dry',
  publishingRequest: {
    schemaVersion: '1.0.0',
    id: 'publish.mcp-demo',
    name: 'MCP',
    source: {
      productionRunId: 'production-run.x.1',
      bundleId: 'b1',
      deliveryManifestHash: 'aa'.repeat(32),
    },
    target: { platform: 'youtube', connectionId: 'conn.youtube.main', expectedChannelId: 'UCTESTCHANNEL' },
    release: { desiredVisibility: 'private', mode: 'manual' },
    subtitles: { uploadSrt: true, uploadVtt: false, language: 'vi' },
  },
  dryRun: true,
}));
assert.equal(dryCreate.dryRun, true);

const created2 = unwrap(await runPublishingControlTool('publishing_run_create', {
  requestId: 'mcp.create2',
  publishingRequest: {
    schemaVersion: '1.0.0',
    id: 'publish.mcp-demo2',
    name: 'MCP2',
    source: {
      productionRunId: 'production-run.x.2',
      bundleId: 'b2',
      deliveryManifestHash: 'ab'.repeat(32),
    },
    target: { platform: 'youtube', connectionId: 'conn.youtube.main', expectedChannelId: 'UCTESTCHANNEL' },
    release: { desiredVisibility: 'private', mode: 'manual' },
    subtitles: { uploadSrt: true, uploadVtt: false, language: 'vi' },
  },
  dryRun: false,
}));
assert.equal(created2.dryRun, false);
const run = created2.run as { runId: string; revision: number; workflowFingerprint: string };
assert.ok(run.runId.startsWith('publishing-run.'));

const listed = unwrap(await runPublishingControlTool('publishing_run_list', { limit: 10 }));
assert.ok(Array.isArray(listed.runs));

const got = unwrap(await runPublishingControlTool('publishing_run_get', { runId: run.runId }));
assert.equal((got.run as { runId: string }).runId, run.runId);

const planned = unwrap(await runPublishingControlTool('publishing_run_plan_next', { runId: run.runId }));
assert.equal((planned.nextAction as { type: string }).type, 'put-artifact');

const validated = unwrap(await runPublishingControlTool('publishing_run_validate', { runId: run.runId }));
assert.equal(validated.valid, true);

const cancelled = unwrap(await runPublishingControlTool('publishing_run_cancel', {
  requestId: 'mcp.cancel',
  runId: run.runId,
  expectedRevision: run.revision,
  expectedWorkflowFingerprint: run.workflowFingerprint,
  dryRun: false,
}));
assert.equal((cancelled.run as { status: string }).status, 'cancelled');
assert.equal((cancelled.data as { noRemoteDeletion: boolean }).noRemoteDeletion, true);

const release = unwrap(await runPublishingControlTool('publishing_run_get_release', { runId: run.runId }));
assert.equal(release.completed, false);

setPublishingOrchestratorForTests(null);
rmSync(root, { recursive: true, force: true });
console.log('publishing-tools.verify.ts: ok');
