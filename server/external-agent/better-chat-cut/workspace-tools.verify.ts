import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WORKSPACE_CONTROL_TOOLS,
  runWorkspaceControlTool,
  setWorkspaceServiceForTests,
} from './workspace-tools.ts';
import { createProductionWorkspaceService } from '../../../packages/production-workspace-services/src/index.ts';
import { createProductionOrchestrator, createFakeAdapters } from '../../../packages/explainer-production-runs/src/index.ts';
import {
  createPublishingOrchestrator,
  createFakePublishingAdapter,
  createFakeDeliverySource,
} from '../../../packages/publishing-operations/src/index.ts';
import type { ExplainerProductionRequestV1 } from '../../../packages/explainer-production-contracts/src/index.ts';

const names = WORKSPACE_CONTROL_TOOLS.map((t) => t.name);
for (const required of [
  'workspace_get_contract',
  'workspace_get_overview',
  'workspace_get_run_detail',
  'workspace_list_reviews',
  'workspace_health_check',
  'workspace_plan_migrations',
  'workspace_apply_migrations',
  'workspace_export_diagnostics',
]) {
  assert.ok(names.includes(required), `missing tool ${required}`);
}

const root = mkdtempSync(join(tmpdir(), 'bcc-ws-mcp-'));
try {
  const service = createProductionWorkspaceService({
    productionOrchestrator: createProductionOrchestrator({
      root: join(root, 'p'),
      adapters: createFakeAdapters(),
    }),
    publishingOrchestrator: createPublishingOrchestrator({
      root: join(root, 'u'),
      adapter: createFakePublishingAdapter(),
      deliverySource: createFakeDeliverySource(),
      skipThumbnailRender: true,
    }),
    productionRoot: join(root, 'p'),
    publishingRoot: join(root, 'u'),
    migrationRoot: join(root, 'm'),
    backupRoot: join(root, 'b'),
  });
  setWorkspaceServiceForTests(service);

  const contract = await runWorkspaceControlTool('workspace_get_contract', {});
  assert.equal((contract as { milestone: string }).milestone, 'M7A');

  const overview = await runWorkspaceControlTool('workspace_get_overview', { limit: 5 });
  assert.equal((overview as { schemaVersion: string }).schemaVersion, '1.0.0');

  const request: ExplainerProductionRequestV1 = {
    schemaVersion: '1.0.0',
    id: 'explainer.mcp-ws',
    name: 'MCP workspace',
    topic: 't',
    objective: 'o',
    audience: { description: 'd' },
    language: 'en',
    duration: { targetSeconds: 60, minimumSeconds: 45, maximumSeconds: 90 },
    output: { width: 1280, height: 720, fps: 30, renderProfile: 'preview-720p-h264' },
    style: {
      visualStyle: 'clean',
      tone: 'clear',
      pacing: 'balanced',
      complexity: 'introductory',
      preferredTheme: { id: 'theme.default', version: '1.0.0' },
    },
    factualPolicy: { requireSources: true },
    project: { mode: 'existing-target', expectedProjectId: 'p1' },
    workflow: {
      reviewMode: 'review-key-stages',
      projectMutationApproval: 'manual',
      allowTemporaryTts: true,
      requireCaptions: true,
      requireSrt: true,
      requireVtt: true,
      maximumStageRetries: 3,
    },
  };

  const created = await service.executeCommand({
    type: 'create-production-run',
    requestId: 'mcp.create',
    productionRequest: request as never,
    dryRun: false,
  });
  assert.ok(created.runId);

  const detail = await runWorkspaceControlTool('workspace_get_run_detail', {
    runType: 'production',
    runId: created.runId,
  });
  assert.equal((detail as { runId: string }).runId, created.runId);

  const reviews = await runWorkspaceControlTool('workspace_list_reviews', { status: 'all' });
  assert.equal((reviews as { schemaVersion: string }).schemaVersion, '1.0.0');

  const health = await runWorkspaceControlTool('workspace_health_check', { mode: 'quick' });
  assert.ok(Array.isArray((health as { checks: unknown[] }).checks));

  const plan = await runWorkspaceControlTool('workspace_plan_migrations', {});
  assert.ok((plan as { planHash: string }).planHash);

  const apply = await runWorkspaceControlTool('workspace_apply_migrations', {
    planId: (plan as { planId: string }).planId,
    planHash: (plan as { planHash: string }).planHash,
    dryRun: true,
  });
  assert.ok((apply as { status: string }).status);

  const diag = await runWorkspaceControlTool('workspace_export_diagnostics', {});
  assert.ok((diag as { bundleHash: string }).bundleHash);
  assert.ok(!JSON.stringify(diag).includes('Bearer '));

  console.log('workspace-tools verification passed');
} finally {
  setWorkspaceServiceForTests(null);
  rmSync(root, { recursive: true, force: true });
}
