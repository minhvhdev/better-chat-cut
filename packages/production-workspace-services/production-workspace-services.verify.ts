import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProductionWorkspaceService } from './src/index.ts';
import { createProductionOrchestrator, createFakeAdapters } from '../explainer-production-runs/src/index.ts';
import {
  createPublishingOrchestrator,
  createFakePublishingAdapter,
  createFakeDeliverySource,
} from '../publishing-operations/src/index.ts';
import type { ExplainerProductionRequestV1 } from '../explainer-production-contracts/src/index.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-ws-'));
const productionRoot = join(root, 'production');
const publishingRoot = join(root, 'publishing');
const migrationRoot = join(root, 'migrations');
const backupRoot = join(root, 'backups');

function sampleRequest(): ExplainerProductionRequestV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'explainer.ws-demo',
    name: 'Workspace demo',
    topic: 'Demo topic',
    objective: 'Verify workspace facade',
    audience: { description: 'Developers' },
    language: 'en',
    duration: { targetSeconds: 60, minimumSeconds: 45, maximumSeconds: 90 },
    output: { width: 1920, height: 1080, fps: 30, renderProfile: 'preview-720p-h264' },
    style: {
      visualStyle: 'clean',
      tone: 'clear',
      pacing: 'balanced',
      complexity: 'introductory',
      preferredTheme: { id: 'theme.default', version: '1.0.0' },
    },
    factualPolicy: { requireSources: true },
    project: { mode: 'existing-target', expectedProjectId: 'project-demo' },
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
}

try {
  mkdirSync(productionRoot, { recursive: true });
  mkdirSync(publishingRoot, { recursive: true });
  mkdirSync(migrationRoot, { recursive: true });

  const production = createProductionOrchestrator({
    root: productionRoot,
    adapters: createFakeAdapters(),
  });
  const publishing = createPublishingOrchestrator({
    root: publishingRoot,
    adapter: createFakePublishingAdapter(),
    deliverySource: createFakeDeliverySource(),
    skipThumbnailRender: true,
  });

  const workspace = createProductionWorkspaceService({
    productionOrchestrator: production,
    publishingOrchestrator: publishing,
    productionRoot,
    publishingRoot,
    migrationRoot,
    backupRoot,
    appVersion: '0.1.7-test',
  });

  // contract
  const contract = workspace.getContract('summary');
  assert.equal(contract.milestone, 'M7A');
  assert.ok(contract.tools.includes('workspace_get_overview'));

  // empty overview
  {
    const overview = await workspace.getOverview({ includeHealth: true });
    assert.equal(overview.schemaVersion, '1.0.0');
    assert.equal(overview.counts.activeProductionRuns, 0);
    assert.ok(['healthy', 'warning', 'error'].includes(overview.healthSummary.status));
  }

  // create production run via command (apply)
  const create = await workspace.executeCommand({
    type: 'create-production-run',
    requestId: 'ws.create.1',
    productionRequest: sampleRequest() as never,
    dryRun: false,
  });
  assert.equal(create.errors.length, 0, JSON.stringify(create.errors));
  assert.ok(create.runId);
  const runId = create.runId!;

  const overview2 = await workspace.getOverview({});
  assert.ok(overview2.recentRuns.some((r) => r.runId === runId));
  assert.ok(overview2.counts.activeProductionRuns + overview2.counts.waitingProductionRuns >= 1);

  const detail = await workspace.getProductionRunDetail(runId);
  assert.equal(detail.runType, 'production');
  assert.ok(detail.stages.length > 0);
  assert.ok(detail.pendingAction);
  assert.ok(detail.lineage);

  // dry-run put artifact without research content validity may fail validation - still returns structured result
  const dryPut = await workspace.executeCommand({
    type: 'put-production-artifact',
    requestId: 'ws.put.dry',
    runId,
    expectedRevision: detail.revision,
    expectedWorkflowFingerprint: detail.workflowFingerprint,
    artifactType: 'research-brief',
    artifact: { schemaVersion: '1.0.0' },
    dryRun: true,
  });
  assert.equal(dryPut.dryRun, true);
  assert.ok(Array.isArray(dryPut.changeSummary) || dryPut.errors.length > 0);

  // conflict handling
  const conflict = await workspace.executeCommand({
    type: 'resume-production-run',
    requestId: 'ws.resume.bad',
    runId,
    expectedRevision: 9999,
    expectedWorkflowFingerprint: 'wrong',
    dryRun: false,
  });
  assert.ok(conflict.errors.some((e) => e.code === 'WORKSPACE_CONFLICT' || e.code.includes('REVISION') || e.code.includes('FINGERPRINT') || e.message));

  // reviews list
  const reviews = await workspace.listReviews({ status: 'all' });
  assert.equal(reviews.schemaVersion, '1.0.0');

  // health
  const health = await workspace.getHealth({ mode: 'quick' });
  assert.equal(health.schemaVersion, '1.0.0');
  assert.ok(health.checks.some((c) => c.id.startsWith('storage.')));

  // migrations plan (noop when no old prefs)
  const plan = await workspace.planMigrations();
  assert.equal(plan.schemaVersion, '1.0.0');
  assert.ok(plan.planHash.length === 64);

  // seed old prefs and plan/apply
  const prefsDir = join(migrationRoot, 'preferences');
  mkdirSync(prefsDir, { recursive: true });
  writeFileSync(join(prefsDir, 'default.json'), JSON.stringify({
    schemaVersion: '0.9.0',
    filters: { status: 'all' },
  }), 'utf8');
  const plan2 = await workspace.planMigrations();
  assert.ok(plan2.migrations.some((m) => m.migrationId.includes('workspace-preferences')));
  const apply = await workspace.applyMigrations({
    planId: plan2.planId,
    planHash: plan2.planHash,
    dryRun: false,
  });
  assert.equal(apply.status, 'applied');
  assert.ok(apply.backupId);
  const plan3 = await workspace.planMigrations();
  assert.equal(plan3.migrations.filter((m) => m.affectedRecords > 0).length, 0);

  // diagnostic export redaction
  const bundle = await workspace.exportDiagnostics();
  assert.equal(bundle.schemaVersion, '1.0.0');
  assert.equal(bundle.redaction.credentialsRemoved, true);
  assert.ok(bundle.bundleHash.length === 64);
  const serialized = JSON.stringify(bundle);
  assert.ok(!serialized.includes('Bearer '));

  // unknown publishing run
  await assert.rejects(() => workspace.getPublishingRunDetail('missing'), /not found/i);

  // cancel dry-run
  const fresh = await workspace.getProductionRunDetail(runId);
  const cancel = await workspace.executeCommand({
    type: 'cancel-production-run',
    requestId: 'ws.cancel.dry',
    runId,
    expectedRevision: fresh.revision,
    expectedWorkflowFingerprint: fresh.workflowFingerprint,
    reason: 'test',
    dryRun: true,
  });
  assert.equal(cancel.dryRun, true);

  console.log('production-workspace-services verification passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
