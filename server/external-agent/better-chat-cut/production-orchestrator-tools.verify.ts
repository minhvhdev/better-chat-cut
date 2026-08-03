import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PRODUCTION_ORCHESTRATOR_CONTROL_TOOLS,
  runProductionOrchestratorControlTool,
  setProductionOrchestratorForTests,
} from './production-orchestrator-tools.ts';
import {
  createProductionOrchestrator,
  createFakeAdapters,
  createProductionRunStore,
} from '../../../packages/explainer-production-runs/src/index.ts';

const skipRender = process.argv.includes('--skip-render');

const REQUIRED = [
  'explainer_orchestrator_get_contract',
  'production_run_create',
  'production_run_list',
  'production_run_get',
  'production_run_validate',
  'production_run_put_artifact',
  'production_run_plan_next',
  'production_run_execute_stage',
  'production_run_review',
  'production_run_resume',
  'production_run_cancel',
  'production_run_get_delivery',
];

for (const name of REQUIRED) {
  assert.ok(PRODUCTION_ORCHESTRATOR_CONTROL_TOOLS.some((t) => t.name === name), `missing tool ${name}`);
}

const root = mkdtempSync(join(tmpdir(), 'bcc-orch-mcp-'));
process.env.BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT = root;
const store = createProductionRunStore({ root });
const orch = createProductionOrchestrator({
  store,
  adapters: createFakeAdapters({
    projectTarget: {
      getTargetedProject: () => ({ projectId: 'p1', width: 1920, height: 1080, fps: 30, targeted: true }),
    },
  }),
});
setProductionOrchestratorForTests(orch);

function unwrap(result: unknown): Record<string, unknown> {
  if (result && typeof result === 'object' && 'structuredContent' in result) {
    return (result as { structuredContent: Record<string, unknown> }).structuredContent;
  }
  return result as Record<string, unknown>;
}

try {
  {
    const contract = unwrap(await runProductionOrchestratorControlTool('explainer_orchestrator_get_contract', { format: 'summary' }));
    assert.ok(Array.isArray(contract.tools));
    assert.equal((contract.tools as string[]).length, 12);
  }

  const request = {
    schemaVersion: '1.0.0',
    id: 'explainer.mcp-test',
    name: 'MCP',
    topic: 'topic',
    objective: 'objective text long enough',
    audience: { description: 'audience description' },
    language: 'vi',
    duration: { targetSeconds: 60 },
    output: { width: 1920, height: 1080, fps: 30, renderProfile: 'preview-720p-h264' },
    style: { visualStyle: 'clean', tone: 'clear', pacing: 'balanced', complexity: 'introductory' },
    factualPolicy: { requireSources: true },
    project: { mode: 'existing-target', expectedProjectId: 'p1' },
  };

  const dryCreate = unwrap(await runProductionOrchestratorControlTool('production_run_create', {
    requestId: 'mcp.create.dry',
    productionRequest: request,
    dryRun: true,
  }));
  assert.equal(dryCreate.dryRun, true);

  const created = unwrap(await runProductionOrchestratorControlTool('production_run_create', {
    requestId: 'mcp.create',
    productionRequest: request,
    dryRun: false,
  }));
  assert.equal(created.dryRun, false);
  const run = created.run as { runId: string; revision: number; workflowFingerprint: string };
  assert.ok(run.runId);

  const listed = unwrap(await runProductionOrchestratorControlTool('production_run_list', { limit: 10 }));
  assert.ok(Array.isArray(listed.runs));

  const got = unwrap(await runProductionOrchestratorControlTool('production_run_get', { runId: run.runId }));
  assert.ok(got.run);
  assert.ok(got.nextAction);

  const research = {
    schemaVersion: '1.0.0',
    id: 'research.mcp',
    topic: 'topic',
    summary: 'summary',
    reviewed: true,
    sources: [
      { id: 's1', title: 't', sourceType: 'article', reliability: 'secondary', url: 'https://example.com' },
    ],
    claims: [
      { id: 'c1', text: 'fact', sourceIds: ['s1'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
    ],
  };

  let current = (got.run as { revision: number; workflowFingerprint: string });
  const put = unwrap(await runProductionOrchestratorControlTool('production_run_put_artifact', {
    requestId: 'mcp.put.research',
    runId: run.runId,
    expectedRevision: current.revision,
    expectedWorkflowFingerprint: current.workflowFingerprint,
    artifactType: 'research-brief',
    artifact: research,
    dryRun: false,
  }));
  assert.ok(put.nextAction);

  const planned = unwrap(await runProductionOrchestratorControlTool('production_run_plan_next', { runId: run.runId }));
  assert.ok(planned.nextAction);

  const fresh = unwrap(await runProductionOrchestratorControlTool('production_run_get', { runId: run.runId }));
  assert.ok(fresh.run);
  const validation = unwrap(await runProductionOrchestratorControlTool('production_run_validate', { runId: run.runId }));
  if (!validation.valid) console.error(JSON.stringify(validation, null, 2));
  assert.equal(validation.valid, true);

  // cancel path on a second run
  const created2 = unwrap(await runProductionOrchestratorControlTool('production_run_create', {
    requestId: 'mcp.create2',
    productionRequest: { ...request, id: 'explainer.mcp-cancel' },
    dryRun: false,
  }));
  const run2 = created2.run as { runId: string; revision: number; workflowFingerprint: string };
  const cancelled = unwrap(await runProductionOrchestratorControlTool('production_run_cancel', {
    requestId: 'mcp.cancel',
    runId: run2.runId,
    expectedRevision: run2.revision,
    expectedWorkflowFingerprint: run2.workflowFingerprint,
    dryRun: false,
  }));
  assert.equal((cancelled.run as { status: string }).status, 'cancelled');

  const delivery = unwrap(await runProductionOrchestratorControlTool('production_run_get_delivery', { runId: run.runId }));
  assert.equal(delivery.completed, false);

  if (!skipRender) {
    // Full render remains covered by production-render-bundles verifies.
  }

  console.log('production-orchestrator-tools.verify.ts: ok');
} finally {
  setProductionOrchestratorForTests(null);
  rmSync(root, { recursive: true, force: true });
}
