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
import type { ExplainerProductionRequestV1, ResearchBriefV1 } from '../explainer-production-contracts/src/index.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-ws-e2e-'));

function sampleRequest(): ExplainerProductionRequestV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'explainer.ws-e2e',
    name: 'E2E workspace',
    topic: 'E2E',
    objective: 'e2e',
    audience: { description: 'dev' },
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
    project: { mode: 'existing-target', expectedProjectId: 'project-e2e' },
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

function sampleResearch(): ResearchBriefV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'research.e2e',
    topic: 'E2E',
    summary: 'Summary for e2e',
    reviewed: true,
    sources: [
      { id: 'src1', title: 'A', sourceType: 'paper', reliability: 'primary', url: 'https://example.com/a' },
      { id: 'src2', title: 'B', sourceType: 'article', reliability: 'secondary', url: 'https://example.com/b' },
      { id: 'src3', title: 'C', sourceType: 'user-provided', reliability: 'unverified' },
    ],
    claims: [
      { id: 'c1', text: 'fact1', sourceIds: ['src1'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
      { id: 'c2', text: 'fact2', sourceIds: ['src1'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
      { id: 'c3', text: 'est', sourceIds: ['src2'], confidence: 'medium', type: 'estimate', reviewStatus: 'accepted', caveat: 'approx' },
      { id: 'c4', text: 'fact4', sourceIds: ['src2'], confidence: 'medium', type: 'fact', reviewStatus: 'accepted' },
      { id: 'c5', text: 'bad', sourceIds: ['src3'], confidence: 'low', type: 'opinion', reviewStatus: 'rejected' },
    ],
  };
}

try {
  const productionRoot = join(root, 'p');
  const publishingRoot = join(root, 'u');
  const migrationRoot = join(root, 'm');
  mkdirSync(productionRoot, { recursive: true });
  mkdirSync(publishingRoot, { recursive: true });

  // corrupt fixture continues to allow other runs
  mkdirSync(join(productionRoot, 'production-run.corrupt-fixture'), { recursive: true });
  writeFileSync(join(productionRoot, 'production-run.corrupt-fixture', 'run.json'), 'not-json', 'utf8');

  const workspace = createProductionWorkspaceService({
    productionOrchestrator: createProductionOrchestrator({
      root: productionRoot,
      adapters: createFakeAdapters(),
    }),
    publishingOrchestrator: createPublishingOrchestrator({
      root: publishingRoot,
      adapter: createFakePublishingAdapter(),
      deliverySource: createFakeDeliverySource({
        valid: true,
        productionRunComplete: true,
        durationMs: 60_000,
        video: {
          fileName: 'final.mp4',
          sha256: 'a'.repeat(64),
          byteLength: 100,
          downloadUrl: '/api/better-chat-cut/deliveries/bundle-e2e/final.mp4',
        },
        qaReportHash: 'b'.repeat(64),
        qaStatus: 'passed',
        errors: [],
      }),
      skipThumbnailRender: true,
    }),
    productionRoot,
    publishingRoot,
    migrationRoot,
    backupRoot: join(root, 'b'),
  });

  // A. seed production run
  const created = await workspace.executeCommand({
    type: 'create-production-run',
    requestId: 'e2e.create',
    productionRequest: sampleRequest() as never,
    dryRun: false,
  });
  assert.ok(created.runId, JSON.stringify(created));
  let runId = created.runId!;
  let detail = await workspace.getProductionRunDetail(runId);

  // B. overview counts
  const overview = await workspace.getOverview({});
  assert.ok(overview.recentRuns.length >= 1);
  assert.ok(overview.healthSummary);

  // C. research put + review cycle (if stage waiting)
  if (detail.pendingAction?.type === 'put-artifact') {
    const put = await workspace.executeCommand({
      type: 'put-production-artifact',
      requestId: 'e2e.research',
      runId,
      expectedRevision: detail.revision,
      expectedWorkflowFingerprint: detail.workflowFingerprint,
      artifactType: 'research-brief',
      artifact: sampleResearch(),
      dryRun: false,
    });
    assert.equal(put.errors.length, 0, JSON.stringify(put.errors));
    detail = await workspace.getProductionRunDetail(runId);
  }

  if (detail.pendingAction?.type === 'review' && detail.pendingAction.reviewId) {
    const review = await workspace.executeCommand({
      type: 'review-production-stage',
      requestId: 'e2e.review',
      runId,
      expectedRevision: detail.revision,
      expectedWorkflowFingerprint: detail.workflowFingerprint,
      reviewId: detail.pendingAction.reviewId,
      decision: 'approve',
      dryRun: false,
    });
    assert.equal(review.errors.length, 0, JSON.stringify(review.errors));
  }

  // list reviews / ops / health / diagnostics
  const reviews = await workspace.listReviews({ status: 'all' });
  assert.ok(reviews.total >= 0);
  const ops = await workspace.listOperations();
  assert.ok(Array.isArray(ops));
  const health = await workspace.getHealth({ mode: 'quick' });
  assert.ok(health.checks.length > 0);
  const diag = await workspace.exportDiagnostics();
  assert.ok(diag.bundleHash);

  // restart simulation: new service same roots
  const workspace2 = createProductionWorkspaceService({
    productionOrchestrator: createProductionOrchestrator({
      root: productionRoot,
      adapters: createFakeAdapters(),
    }),
    publishingOrchestrator: createPublishingOrchestrator({
      root: publishingRoot,
      adapter: createFakePublishingAdapter(),
      deliverySource: createFakeDeliverySource(),
      skipThumbnailRender: true,
    }),
    productionRoot,
    publishingRoot,
    migrationRoot,
    backupRoot: join(root, 'b'),
  });
  const reloaded = await workspace2.getProductionRunDetail(runId);
  assert.equal(reloaded.runId, runId);
  assert.ok(reloaded.pendingAction || reloaded.status);

  // cancel retained honesty
  const cancelDry = await workspace2.executeCommand({
    type: 'cancel-production-run',
    requestId: 'e2e.cancel.dry',
    runId,
    expectedRevision: reloaded.revision,
    expectedWorkflowFingerprint: reloaded.workflowFingerprint,
    dryRun: true,
  });
  assert.equal(cancelDry.dryRun, true);
  const still = await workspace2.getProductionRunDetail(runId);
  assert.notEqual(still.status, 'cancelled');

  console.log('production-workspace e2e verification passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
