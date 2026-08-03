import assert from 'node:assert/strict';
import {
  validateWorkspaceCommand,
  validateWorkspaceOverviewQuery,
  validateWorkspaceReviewQuery,
  validateWorkspaceHealthOptions,
  validateWorkspaceMigrationApply,
  validateWorkspaceRunDetail,
  validateWorkspaceOverview,
  computeWorkspaceEntityHash,
  selectProductionRunSummary,
  selectPublishingRunSummary,
  selectUnifiedRunSummaries,
  selectProductionStageViews,
  selectNextActionView,
  selectLineageView,
  workspaceDiagnostic,
  type WorkspaceOverviewV1,
  type WorkspaceRunDetailV1,
} from './src/index.ts';

// overview query
{
  const v = validateWorkspaceOverviewQuery({ limit: 10, runType: 'production', sortBy: 'updatedAt' });
  assert.equal(v.valid, true);
  assert.equal(v.value?.limit, 10);
  assert.equal(validateWorkspaceOverviewQuery({ limit: 999 }).valid, false);
}

// review query
{
  const v = validateWorkspaceReviewQuery({ status: 'pending', limit: 5 });
  assert.equal(v.valid, true);
  assert.equal(v.value?.limit, 5);
}

// health options
{
  assert.equal(validateWorkspaceHealthOptions({ mode: 'deep' }).value?.mode, 'deep');
  assert.equal(validateWorkspaceHealthOptions(null).value?.mode, 'quick');
}

// migration apply
{
  assert.equal(validateWorkspaceMigrationApply({ planId: 'p1', planHash: 'a'.repeat(64) }).valid, true);
  assert.equal(validateWorkspaceMigrationApply({ planId: 'p1', planHash: 'short' }).valid, false);
}

// commands
{
  const create = validateWorkspaceCommand({
    type: 'create-production-run',
    requestId: 'req-1',
    productionRequest: { id: 'x' },
    dryRun: true,
  });
  assert.equal(create.valid, true);

  const put = validateWorkspaceCommand({
    type: 'put-production-artifact',
    requestId: 'req-2',
    runId: 'run-1',
    expectedRevision: 1,
    expectedWorkflowFingerprint: 'abc',
    artifactType: 'research-brief',
    artifact: {},
  });
  assert.equal(put.valid, true);

  assert.equal(validateWorkspaceCommand({ type: 'unknown', requestId: 'x' }).valid, false);
  assert.equal(validateWorkspaceCommand({
    type: 'resume-production-run',
    requestId: 'x',
  }).valid, false, 'missing guard fields');
}

// selectors
{
  const production = {
    runId: 'production-run.t1',
    requestId: 'req.t1',
    status: 'awaiting-input',
    currentStageId: 'research',
    revision: 2,
    workflowFingerprint: 'fp1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    stages: [
      {
        stageId: 'intake',
        status: 'completed',
        attempt: 1,
        inputArtifacts: [],
        outputArtifacts: [{ artifactType: 'production-request', artifactHash: 'a'.repeat(64) }],
        errors: [],
        warnings: [],
      },
      {
        stageId: 'research',
        status: 'awaiting-input',
        attempt: 0,
        inputArtifacts: [{ artifactType: 'production-request', artifactHash: 'a'.repeat(64) }],
        outputArtifacts: [],
        errors: [],
        warnings: [],
      },
    ],
    artifacts: [{ artifactType: 'production-request', artifactHash: 'a'.repeat(64) }],
  };
  const summary = selectProductionRunSummary(production, 'put-artifact', 'Demo');
  assert.equal(summary.runType, 'production');
  assert.equal(summary.progress.completedStages, 1);
  assert.equal(summary.nextActionType, 'put-artifact');

  const stages = selectProductionStageViews(production, { type: 'put-artifact', stageId: 'research' });
  assert.ok(stages.find((s) => s.id === 'research')?.availableActions.some((a) => a.type === 'put-artifact'));

  const lineage = selectLineageView(production.stages);
  assert.equal(lineage.nodes.length, 1);

  const next = selectNextActionView({ type: 'put-artifact', stageId: 'research', requirements: ['ResearchBriefV1'] });
  assert.ok(next?.label.includes('artifact'));
}

// overview / detail validators
{
  const overview: WorkspaceOverviewV1 = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    counts: {
      activeProductionRuns: 0,
      waitingProductionRuns: 0,
      blockedProductionRuns: 0,
      completedProductionRuns: 0,
      activePublishingRuns: 0,
      waitingPublishingRuns: 0,
      blockedPublishingRuns: 0,
      completedPublishingRuns: 0,
      pendingReviews: 0,
      activeOperations: 0,
      failedOperations: 0,
    },
    recentRuns: [],
    pendingReviews: [],
    activeOperations: [],
    healthSummary: { status: 'healthy', issueCount: 0 },
    errors: [],
    warnings: [],
    pagination: { total: 0, limit: 20, offset: 0 },
  };
  assert.equal(validateWorkspaceOverview(overview).valid, true);

  const detail: WorkspaceRunDetailV1 = {
    schemaVersion: '1.0.0',
    runType: 'production',
    runId: 'r1',
    revision: 1,
    workflowFingerprint: 'fp',
    name: 'n',
    status: 'active',
    currentStageId: 'research',
    stages: [],
    artifacts: [],
    lineage: { nodes: [] },
    reviews: [],
    operations: [],
    errors: [],
    warnings: [],
  };
  assert.equal(validateWorkspaceRunDetail(detail).valid, true);
}

// hash stability
{
  const h1 = computeWorkspaceEntityHash({ a: 1, b: 2 });
  const h2 = computeWorkspaceEntityHash({ b: 2, a: 1 });
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
}

// diagnostic helper
assert.equal(workspaceDiagnostic('error', 'X', 'msg').severity, 'error');

// unified sort
{
  const a = selectProductionRunSummary({
    runId: 'p1', requestId: 'p1', status: 'active', currentStageId: 'x', revision: 1,
    workflowFingerprint: 'f', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z',
    stages: [], artifacts: [],
  });
  const b = selectPublishingRunSummary({
    runId: 'u1', requestId: 'u1', status: 'active', currentStageId: 'y', revision: 1,
    workflowFingerprint: 'f', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z',
    source: { productionRunId: 'p1', bundleId: 'b', deliveryManifestHash: 'h' },
    stages: [], artifacts: [],
  });
  assert.equal(selectUnifiedRunSummaries([a], [b])[0].runId, 'u1');
}

console.log('production-workspace-contracts verification passed');
