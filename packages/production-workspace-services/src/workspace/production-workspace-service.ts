import {
  accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync,
  writeFileSync, unlinkSync, copyFileSync, rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import {
  createProductionOrchestrator,
  createFakeAdapters,
  type ProductionOrchestrator,
} from '../../../explainer-production-runs/src/index.ts';
import {
  createPublishingOrchestrator,
  createFakePublishingAdapter,
  createFakeDeliverySource,
  type PublishingOrchestrator,
} from '../../../publishing-operations/src/index.ts';
import { resolveProductionRunRoot } from '../../../explainer-production-runs/src/storage/production-run-root.ts';
import { resolvePublishingRoot } from '../../../publishing-operations/src/storage/publishing-root.ts';
import {
  type WorkspaceCommandResultV1,
  type WorkspaceCommandV1,
  type WorkspaceDiagnostic,
  type WorkspaceDiagnosticBundleV1,
  type WorkspaceHealthOptionsV1,
  type WorkspaceHealthReportV1,
  type WorkspaceMigrationApplyInputV1,
  type WorkspaceMigrationPlanV1,
  type WorkspaceMigrationReceiptV1,
  type WorkspaceOverviewQueryV1,
  type WorkspaceOverviewV1,
  type WorkspaceReviewQueryV1,
  type WorkspaceReviewQueueV1,
  type WorkspaceRunDetailV1,
  type WorkspaceRunSummaryV1,
  type WorkspaceOperationViewV1,
  type WorkspaceReviewItemV1,
  WorkspaceError,
  workspaceDiagnostic,
  selectProductionRunSummary,
  selectPublishingRunSummary,
  selectUnifiedRunSummaries,
  selectProductionStageViews,
  selectPublishingStageViews,
  selectNextActionView,
  selectArtifactViews,
  selectLineageView,
  selectOperationsFromStages,
  selectReviewItemsFromProduction,
  selectReviewItemsFromPublishing,
  isActiveStatus,
  isWaitingStatus,
  isBlockedStatus,
  sha256Hex,
  stableStringify,
  validateWorkspaceCommand,
  computeWorkspaceEntityHash,
} from '../../../production-workspace-contracts/src/index.ts';
import { redactDiagnosticValue, redactString } from '../diagnostics/diagnostic-redaction.ts';
import {
  planMigrations,
  applyMigrations,
  listDataVersions,
  type MigrationContext,
} from '../migrations/migration-runner.ts';
import {
  collectHealthReport,
  type HealthContext,
} from '../health/workspace-health-service.ts';

export type ProductionWorkspaceServiceOptions = {
  productionOrchestrator?: ProductionOrchestrator;
  publishingOrchestrator?: PublishingOrchestrator;
  productionRoot?: string;
  publishingRoot?: string;
  migrationRoot?: string;
  backupRoot?: string;
  appVersion?: string;
  desktop?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeName(requestId: string): string {
  return requestId.length > 64 ? requestId.slice(0, 64) : requestId;
}

function filterSummaries(
  items: WorkspaceRunSummaryV1[],
  query: WorkspaceOverviewQueryV1,
): WorkspaceRunSummaryV1[] {
  let result = items;
  if (query.runType && query.runType !== 'all') {
    result = result.filter((r) => r.runType === query.runType);
  }
  if (query.status?.length) {
    const set = new Set(query.status);
    result = result.filter((r) => set.has(r.status));
  }
  if (query.stageId) {
    result = result.filter((r) => r.currentStageId === query.stageId);
  }
  if (query.projectId) {
    result = result.filter((r) => r.projectId === query.projectId);
  }
  if (query.search?.trim()) {
    const q = query.search.trim().toLowerCase();
    result = result.filter((r) =>
      r.runId.toLowerCase().includes(q)
      || r.name.toLowerCase().includes(q)
      || r.status.toLowerCase().includes(q)
      || r.currentStageId.toLowerCase().includes(q));
  }
  const sortBy = query.sortBy ?? 'updatedAt';
  const dir = query.sortDir === 'asc' ? 1 : -1;
  result = [...result].sort((a, b) => {
    if (sortBy === 'status') return a.status.localeCompare(b.status) * dir;
    if (sortBy === 'createdAt') return a.createdAt.localeCompare(b.createdAt) * dir;
    return a.updatedAt.localeCompare(b.updatedAt) * dir;
  });
  return result;
}

function countBuckets(
  production: WorkspaceRunSummaryV1[],
  publishing: WorkspaceRunSummaryV1[],
  reviews: WorkspaceReviewItemV1[],
  operations: WorkspaceOperationViewV1[],
) {
  const pActive = production.filter((r) => isActiveStatus(r.status) && !isWaitingStatus(r.status) && !isBlockedStatus(r.status));
  const pWait = production.filter((r) => isWaitingStatus(r.status));
  const pBlock = production.filter((r) => isBlockedStatus(r.status) || r.blockerCount > 0);
  const pDone = production.filter((r) => r.status === 'completed');
  const uActive = publishing.filter((r) => isActiveStatus(r.status) && !isWaitingStatus(r.status) && !isBlockedStatus(r.status));
  const uWait = publishing.filter((r) => isWaitingStatus(r.status));
  const uBlock = publishing.filter((r) => isBlockedStatus(r.status) || r.blockerCount > 0);
  const uDone = publishing.filter((r) => r.status === 'completed');
  return {
    activeProductionRuns: pActive.length + pWait.length,
    waitingProductionRuns: pWait.length,
    blockedProductionRuns: pBlock.length,
    completedProductionRuns: pDone.length,
    activePublishingRuns: uActive.length + uWait.length,
    waitingPublishingRuns: uWait.length,
    blockedPublishingRuns: uBlock.length,
    completedPublishingRuns: uDone.length,
    pendingReviews: reviews.filter((r) => r.status === 'pending').length,
    activeOperations: operations.filter((o) => !['completed', 'failed', 'cancelled'].includes(o.status)).length,
    failedOperations: operations.filter((o) => o.status === 'failed' || o.status === 'reconciliation-required').length,
  };
}

export function createProductionWorkspaceService(options: ProductionWorkspaceServiceOptions = {}) {
  const productionRoot = options.productionRoot ?? resolveProductionRunRoot();
  const publishingRoot = options.publishingRoot ?? resolvePublishingRoot();
  const migrationRoot = options.migrationRoot
    ?? process.env.BETTER_CHAT_CUT_WORKSPACE_MIGRATION_ROOT
    ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'workspace-migrations');
  const backupRoot = options.backupRoot
    ?? process.env.BETTER_CHAT_CUT_WORKSPACE_BACKUP_ROOT
    ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'workspace-backups');
  const appVersion = options.appVersion ?? process.env.npm_package_version ?? '0.1.7';
  const desktop = options.desktop
    ?? (process.env.CC_DESKTOP === '1' || process.env.BETTER_CHAT_CUT_DESKTOP === '1');

  const production = options.productionOrchestrator ?? createProductionOrchestrator({
    root: productionRoot,
    adapters: createFakeAdapters(),
  });
  const publishing = options.publishingOrchestrator ?? createPublishingOrchestrator({
    root: publishingRoot,
    adapter: createFakePublishingAdapter(),
    deliverySource: createFakeDeliverySource(),
    skipThumbnailRender: true,
  });

  function listProductionSummaries(): WorkspaceRunSummaryV1[] {
    const summaries: WorkspaceRunSummaryV1[] = [];
    let runIds: string[] = [];
    try {
      if (existsSync(productionRoot)) {
        runIds = readdirSync(productionRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      }
    } catch {
      runIds = [];
    }
    for (const runId of runIds) {
      try {
        const run = production.getRun(runId);
        if (!run) {
          summaries.push({
            runType: 'production',
            runId,
            name: runId,
            status: 'blocked',
            currentStageId: 'unknown',
            progress: { completedStages: 0, totalStages: 1, percent: 0 },
            pendingReviewCount: 0,
            blockerCount: 1,
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
            invalid: true,
            invalidReason: 'Run record missing or unreadable',
          });
          continue;
        }
        let nextType: string | undefined;
        try {
          nextType = production.planNext(run.runId).type;
        } catch {
          nextType = undefined;
        }
        summaries.push(selectProductionRunSummary(run, nextType, safeName(run.requestId)));
      } catch (error) {
        summaries.push({
          runType: 'production',
          runId,
          name: runId,
          status: 'blocked',
          currentStageId: 'unknown',
          progress: { completedStages: 0, totalStages: 1, percent: 0 },
          pendingReviewCount: 0,
          blockerCount: 1,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          invalid: true,
          invalidReason: redactString(error instanceof Error ? error.message : String(error)),
        });
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function listPublishingSummaries(): WorkspaceRunSummaryV1[] {
    const summaries: WorkspaceRunSummaryV1[] = [];
    const runsRoot = join(publishingRoot, 'runs');
    let runIds: string[] = [];
    try {
      if (existsSync(runsRoot)) {
        runIds = readdirSync(runsRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      }
    } catch {
      runIds = [];
    }
    for (const runId of runIds) {
      try {
        const run = publishing.getRun(runId);
        if (!run) {
          summaries.push({
            runType: 'publishing',
            runId,
            name: runId,
            status: 'blocked',
            currentStageId: 'unknown',
            progress: { completedStages: 0, totalStages: 1, percent: 0 },
            pendingReviewCount: 0,
            blockerCount: 1,
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
            invalid: true,
            invalidReason: 'Run record missing or unreadable',
          });
          continue;
        }
        let nextType: string | undefined;
        try {
          nextType = publishing.planNext(run.runId).type;
        } catch {
          nextType = undefined;
        }
        summaries.push(selectPublishingRunSummary(run, nextType, safeName(run.requestId)));
      } catch (error) {
        summaries.push({
          runType: 'publishing',
          runId,
          name: runId,
          status: 'blocked',
          currentStageId: 'unknown',
          progress: { completedStages: 0, totalStages: 1, percent: 0 },
          pendingReviewCount: 0,
          blockerCount: 1,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          invalid: true,
          invalidReason: redactString(error instanceof Error ? error.message : String(error)),
        });
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function collectReviews(): WorkspaceReviewItemV1[] {
    const items: WorkspaceReviewItemV1[] = [];
    for (const summary of listProductionSummaries()) {
      if (summary.invalid) continue;
      let run;
      try {
        run = production.getRun(summary.runId);
      } catch {
        continue;
      }
      if (!run) continue;
      const reviews = run.stages
        .filter((st) => st.review)
        .map((st) => {
          const full = production.store.getReview(run.runId, st.review!.reviewId);
          return {
            reviewId: st.review!.reviewId,
            stageId: st.stageId,
            status: st.review!.status,
            artifactReferences: full?.artifactReferences
              ?? st.outputArtifacts.map((a) => ({ artifactType: a.artifactType, artifactHash: a.artifactHash })),
            createdAt: full?.createdAt ?? run.updatedAt,
            decidedAt: full?.decidedAt,
          };
        });
      items.push(...selectReviewItemsFromProduction(run, safeName(run.requestId), reviews));
    }
    for (const summary of listPublishingSummaries()) {
      if (summary.invalid) continue;
      let run;
      try {
        run = publishing.getRun(summary.runId);
      } catch {
        continue;
      }
      if (!run) continue;
      const reviews = run.stages
        .filter((st) => st.review)
        .map((st) => {
          const full = publishing.store.getReview(run.runId, st.review!.reviewId);
          return {
            reviewId: st.review!.reviewId,
            stageId: st.stageId,
            status: st.review!.status,
            artifactReferences: full?.artifactReferences
              ?? st.outputArtifacts.map((a) => ({ artifactType: a.artifactType, artifactHash: a.artifactHash })),
            remote: full?.remote,
            createdAt: full?.createdAt ?? run.updatedAt,
            decidedAt: full?.decidedAt,
          };
        });
      items.push(...selectReviewItemsFromPublishing(run, safeName(run.requestId), reviews));
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function collectOperations(): WorkspaceOperationViewV1[] {
    const ops: WorkspaceOperationViewV1[] = [];
    for (const summary of listProductionSummaries()) {
      if (summary.invalid) continue;
      let run;
      try {
        run = production.getRun(summary.runId);
      } catch {
        continue;
      }
      if (!run) continue;
      ops.push(...selectOperationsFromStages('production', run.runId, run.stages));
    }
    for (const summary of listPublishingSummaries()) {
      if (summary.invalid) continue;
      let run;
      try {
        run = publishing.getRun(summary.runId);
      } catch {
        continue;
      }
      if (!run) continue;
      let extra: WorkspaceOperationViewV1[] = [];
      if (run.upload?.operationId) {
        try {
          const op = publishing.store.getUploadOperation(run.runId, run.upload.operationId);
          if (op) {
            extra = [{
              operationId: op.operationId,
              runType: 'publishing',
              runId: run.runId,
              type: 'upload',
              status: op.status,
              progress: {
                phase: op.progress?.phase ?? op.status,
                percent: op.progress?.percent,
                bytesUploaded: op.progress?.bytesUploaded,
                totalBytes: op.progress?.totalBytes,
              },
              createdAt: op.createdAt,
              updatedAt: op.updatedAt,
              error: op.error,
              recoverable: ['failed', 'reconciliation-required'].includes(op.status),
              recoveryActions: ['resume', 'reconcile', 'export-diagnostics'],
            }];
          }
        } catch {
          // degraded — operations still derived from stages
        }
      }
      ops.push(...selectOperationsFromStages('publishing', run.runId, run.stages, extra));
    }
    // de-dupe by operationId
    const seen = new Set<string>();
    return ops.filter((o) => {
      if (seen.has(o.operationId)) return false;
      seen.add(o.operationId);
      return true;
    });
  }

  async function getOverview(query: WorkspaceOverviewQueryV1 = {}): Promise<WorkspaceOverviewV1> {
    const productionSummaries = listProductionSummaries();
    const publishingSummaries = listPublishingSummaries();
    const unified = selectUnifiedRunSummaries(productionSummaries, publishingSummaries);
    const filtered = filterSummaries(unified, query);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const page = filtered.slice(offset, offset + limit);
    const reviews = collectReviews().filter((r) => r.status === 'pending').slice(0, 20);
    const operations = collectOperations().filter((o) =>
      !['completed', 'cancelled'].includes(o.status)).slice(0, 20);
    const errors: WorkspaceDiagnostic[] = [];
    const warnings: WorkspaceDiagnostic[] = [];
    for (const r of unified.filter((x) => x.invalid)) {
      warnings.push(workspaceDiagnostic('warning', 'WORKSPACE_RUN_INVALID', r.invalidReason ?? 'Invalid run', {
        runType: r.runType,
        runId: r.runId,
        recovery: 'Open health page and export diagnostics; unaffected runs remain usable',
      }));
    }
    let healthSummary: WorkspaceOverviewV1['healthSummary'] = { status: 'healthy', issueCount: 0 };
    if (query.includeHealth !== false) {
      try {
        const health = await getHealth({ mode: 'quick' });
        healthSummary = {
          status: health.status,
          issueCount: health.errors.length + health.warnings.length
            + health.checks.filter((c) => c.status === 'fail' || c.status === 'warn').length,
        };
      } catch {
        healthSummary = { status: 'warning', issueCount: 1 };
        warnings.push(workspaceDiagnostic('warning', 'WORKSPACE_HEALTH_UNAVAILABLE', 'Health check unavailable'));
      }
    }
    return {
      schemaVersion: '1.0.0',
      generatedAt: nowIso(),
      counts: countBuckets(productionSummaries, publishingSummaries, collectReviews(), collectOperations()),
      recentRuns: page,
      pendingReviews: reviews,
      activeOperations: operations,
      healthSummary,
      errors,
      warnings,
      pagination: { total: filtered.length, limit, offset },
    };
  }

  async function getProductionRunDetail(runId: string): Promise<WorkspaceRunDetailV1> {
    let run;
    try {
      run = production.getRun(runId);
    } catch (error) {
      throw new WorkspaceError(
        'WORKSPACE_RUN_NOT_FOUND',
        `Production run not found: ${runId}`,
        { cause: redactString(error instanceof Error ? error.message : String(error)) },
      );
    }
    if (!run) {
      throw new WorkspaceError('WORKSPACE_RUN_NOT_FOUND', `Production run not found: ${runId}`);
    }
    let next;
    try {
      next = production.planNext(runId);
    } catch {
      next = undefined;
    }
    const errors: WorkspaceDiagnostic[] = [];
    const warnings: WorkspaceDiagnostic[] = [];
    for (const stage of run.stages) {
      errors.push(...(stage.errors as WorkspaceDiagnostic[]));
      warnings.push(...(stage.warnings as WorkspaceDiagnostic[]));
    }
    let delivery: WorkspaceRunDetailV1['delivery'];
    if (run.delivery) {
      try {
        const d = await production.getDelivery(runId);
        if (d.delivery) {
          delivery = {
            bundleId: d.delivery.bundleId,
            manifestHash: d.delivery.manifestHash,
            qaStatus: d.delivery.qaStatus,
            completed: d.completed,
            artifacts: d.delivery.artifacts.map((a) => ({
              role: a.role,
              fileName: a.fileName,
              sha256: a.sha256,
              downloadUrl: a.downloadUrl,
            })),
          };
        }
      } catch {
        warnings.push(workspaceDiagnostic('warning', 'WORKSPACE_DELIVERY_UNAVAILABLE', 'Delivery summary unavailable', {
          runId,
          recovery: 'Re-validate production render bundle',
        }));
      }
    }
    const reviewRecords = run.stages
      .filter((st) => st.review)
      .map((st) => {
        const full = production.store.getReview(run.runId, st.review!.reviewId);
        return {
          reviewId: st.review!.reviewId,
          stageId: st.stageId,
          status: st.review!.status,
          artifactReferences: full?.artifactReferences
            ?? st.outputArtifacts.map((a) => ({ artifactType: a.artifactType, artifactHash: a.artifactHash })),
          createdAt: full?.createdAt ?? run.updatedAt,
          decidedAt: full?.decidedAt,
        };
      });
    return {
      schemaVersion: '1.0.0',
      runType: 'production',
      runId: run.runId,
      revision: run.revision,
      workflowFingerprint: run.workflowFingerprint,
      name: safeName(run.requestId),
      status: run.status,
      currentStageId: run.currentStageId,
      project: {
        projectId: run.project.boundProjectId ?? run.project.expectedProjectId,
      },
      stages: selectProductionStageViews(run, next),
      artifacts: selectArtifactViews('production', run.artifacts, run.stages),
      lineage: selectLineageView(run.stages),
      pendingAction: selectNextActionView(next),
      reviews: selectReviewItemsFromProduction(run, safeName(run.requestId), reviewRecords),
      operations: selectOperationsFromStages('production', run.runId, run.stages),
      delivery,
      errors: errors.map((e) => redactDiagnosticValue(e) as WorkspaceDiagnostic),
      warnings: warnings.map((w) => redactDiagnosticValue(w) as WorkspaceDiagnostic),
    };
  }

  async function getPublishingRunDetail(runId: string): Promise<WorkspaceRunDetailV1> {
    let run;
    try {
      run = publishing.getRun(runId);
    } catch (error) {
      throw new WorkspaceError(
        'WORKSPACE_RUN_NOT_FOUND',
        `Publishing run not found: ${runId}`,
        { cause: redactString(error instanceof Error ? error.message : String(error)) },
      );
    }
    if (!run) {
      throw new WorkspaceError('WORKSPACE_RUN_NOT_FOUND', `Publishing run not found: ${runId}`);
    }
    let next;
    try {
      next = publishing.planNext(runId);
    } catch {
      next = undefined;
    }
    const errors: WorkspaceDiagnostic[] = [];
    const warnings: WorkspaceDiagnostic[] = [];
    for (const stage of run.stages) {
      errors.push(...(stage.errors as WorkspaceDiagnostic[]));
      warnings.push(...(stage.warnings as WorkspaceDiagnostic[]));
    }
    const reviewRecords = run.stages
      .filter((st) => st.review)
      .map((st) => {
        const full = publishing.store.getReview(run.runId, st.review!.reviewId);
        return {
          reviewId: st.review!.reviewId,
          stageId: st.stageId,
          status: st.review!.status,
          artifactReferences: full?.artifactReferences
            ?? st.outputArtifacts.map((a) => ({ artifactType: a.artifactType, artifactHash: a.artifactHash })),
          remote: full?.remote,
          createdAt: full?.createdAt ?? run.updatedAt,
          decidedAt: full?.decidedAt,
        };
      });
    return {
      schemaVersion: '1.0.0',
      runType: 'publishing',
      runId: run.runId,
      revision: run.revision,
      workflowFingerprint: run.workflowFingerprint,
      name: safeName(run.requestId),
      status: run.status,
      currentStageId: run.currentStageId,
      project: { projectId: run.source.productionRunId },
      stages: selectPublishingStageViews(run, next),
      artifacts: selectArtifactViews('publishing', run.artifacts, run.stages),
      lineage: selectLineageView(run.stages),
      pendingAction: selectNextActionView(next),
      reviews: selectReviewItemsFromPublishing(run, safeName(run.requestId), reviewRecords),
      operations: selectOperationsFromStages('publishing', run.runId, run.stages),
      errors: errors.map((e) => redactDiagnosticValue(e) as WorkspaceDiagnostic),
      warnings: warnings.map((w) => redactDiagnosticValue(w) as WorkspaceDiagnostic),
    };
  }

  async function listReviews(query: WorkspaceReviewQueryV1 = {}): Promise<WorkspaceReviewQueueV1> {
    let items = collectReviews();
    if (query.runType && query.runType !== 'all') {
      items = items.filter((i) => i.runType === query.runType);
    }
    if (query.reviewType && query.reviewType !== 'all') {
      items = items.filter((i) => i.reviewType === query.reviewType);
    }
    if (query.status && query.status !== 'all') {
      items = items.filter((i) => i.status === query.status);
    }
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    return {
      schemaVersion: '1.0.0',
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
      generatedAt: nowIso(),
    };
  }

  async function executeCommand(command: WorkspaceCommandV1): Promise<WorkspaceCommandResultV1> {
    const validated = validateWorkspaceCommand(command);
    if (!validated.valid || !validated.value) {
      return {
        schemaVersion: '1.0.0',
        dryRun: true,
        commandType: (command as WorkspaceCommandV1).type ?? 'create-production-run',
        errors: validated.errors,
        warnings: validated.warnings,
      };
    }
    const cmd = validated.value;
    const dryRun = cmd.dryRun !== false;

    try {
      switch (cmd.type) {
        case 'create-production-run': {
          const result = await production.createRun({
            requestId: cmd.requestId,
            productionRequest: cmd.productionRequest as never,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'production',
            runId: result.run?.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: result.dryRun
              ? ['Would create production run', `requestId=${cmd.requestId}`]
              : ['Created production run'],
            data: { nextAction: result.nextAction, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'put-production-artifact': {
          const result = await production.putArtifact({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            artifactType: cmd.artifactType,
            artifact: cmd.artifact,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'production',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [
              `${dryRun ? 'Would put' : 'Put'} artifact ${cmd.artifactType}`,
            ],
            data: { nextAction: result.nextAction, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'execute-production-stage': {
          const result = await production.executeStage({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            stageId: cmd.stageId as never,
            editSessionId: cmd.editSessionId,
            stageInput: cmd.stageInput as never,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'production',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [`${dryRun ? 'Would execute' : 'Executed'} stage ${cmd.stageId ?? 'auto'}`],
            data: { nextAction: result.nextAction, receipt: result.receipt, payload: result.data },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'review-production-stage': {
          const result = await production.reviewStage({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            reviewId: cmd.reviewId,
            decision: cmd.decision,
            notes: cmd.notes,
            requestedChanges: cmd.requestedChanges,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'production',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [`${dryRun ? 'Would' : ''} ${cmd.decision} review ${cmd.reviewId}`.trim()],
            data: { nextAction: result.nextAction, review: result.review, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'resume-production-run': {
          const result = await production.resumeRun({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'production',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [dryRun ? 'Would resume production run' : 'Resumed production run'],
            data: { nextAction: result.nextAction, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'cancel-production-run': {
          const result = await production.cancelRun({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            reason: cmd.reason,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'production',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [dryRun ? 'Would cancel production run' : 'Cancelled production run'],
            data: { nextAction: result.nextAction, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'create-publishing-run': {
          const result = await publishing.createRun({
            requestId: cmd.requestId,
            publishingRequest: cmd.publishingRequest as never,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'publishing',
            runId: result.run?.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [dryRun ? 'Would create publishing run' : 'Created publishing run'],
            data: { nextAction: result.nextAction, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'put-publishing-artifact': {
          const result = await publishing.putArtifact({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            artifactType: cmd.artifactType,
            artifact: cmd.artifact,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'publishing',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [`${dryRun ? 'Would put' : 'Put'} ${cmd.artifactType}`],
            data: { nextAction: result.nextAction, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'execute-publishing-stage': {
          const result = await publishing.executeStage({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            stageId: cmd.stageId as never,
            stageInput: cmd.stageInput,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'publishing',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [`${dryRun ? 'Would execute' : 'Executed'} publishing stage`],
            data: { nextAction: result.nextAction, receipt: result.receipt, payload: result.data },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'review-publishing-stage': {
          const result = await publishing.reviewStage({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            reviewId: cmd.reviewId,
            decision: cmd.decision,
            notes: cmd.notes,
            requestedChanges: cmd.requestedChanges,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'publishing',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [`${cmd.decision} publishing review`],
            data: { nextAction: result.nextAction, review: result.review, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'resume-publishing-run': {
          const result = await publishing.resumeRun({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'publishing',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [dryRun ? 'Would resume publishing run' : 'Resumed publishing run'],
            data: { nextAction: result.nextAction, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        case 'cancel-publishing-run': {
          const result = await publishing.cancelRun({
            requestId: cmd.requestId,
            runId: cmd.runId,
            expectedRevision: cmd.expectedRevision,
            expectedWorkflowFingerprint: cmd.expectedWorkflowFingerprint,
            reason: cmd.reason,
            dryRun,
          });
          return {
            schemaVersion: '1.0.0',
            dryRun: result.dryRun,
            commandType: cmd.type,
            runType: 'publishing',
            runId: cmd.runId,
            revision: result.run?.revision,
            workflowFingerprint: result.run?.workflowFingerprint,
            nextActionType: result.nextAction?.type,
            changeSummary: [dryRun ? 'Would cancel publishing run' : 'Cancelled publishing run'],
            data: { nextAction: result.nextAction, receipt: result.receipt },
            errors: result.errors as WorkspaceDiagnostic[],
            warnings: result.warnings as WorkspaceDiagnostic[],
          };
        }
        default:
          throw new WorkspaceError('WORKSPACE_COMMAND_UNSUPPORTED', 'Unsupported command');
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'PRODUCTION_RUN_REVISION_CONFLICT'
        || code === 'PUBLISHING_RUN_REVISION_CONFLICT'
        || code === 'PRODUCTION_RUN_WORKFLOW_FINGERPRINT_MISMATCH'
        || code === 'PUBLISHING_RUN_WORKFLOW_FINGERPRINT_MISMATCH') {
        return {
          schemaVersion: '1.0.0',
          dryRun,
          commandType: cmd.type,
          errors: [workspaceDiagnostic('error', 'WORKSPACE_CONFLICT',
            redactString(error instanceof Error ? error.message : String(error)), {
              recovery: 'Reload run and re-apply changes. Unsaved local edits were not saved.',
            })],
          warnings: [],
        };
      }
      return {
        schemaVersion: '1.0.0',
        dryRun,
        commandType: cmd.type,
        errors: [workspaceDiagnostic('error',
          typeof code === 'string' ? code : 'WORKSPACE_COMMAND_INVALID',
          redactString(error instanceof Error ? error.message : String(error)), {
            recovery: 'Inspect diagnostics and retry after fixing the blocker',
          })],
        warnings: [],
      };
    }
  }

  async function getHealth(options: WorkspaceHealthOptionsV1 = {}): Promise<WorkspaceHealthReportV1> {
    const ctx: HealthContext = {
      productionRoot,
      publishingRoot,
      migrationRoot,
      production,
      publishing,
      desktop,
      mode: options.mode ?? 'quick',
    };
    return collectHealthReport(ctx);
  }

  async function planDataMigrations(): Promise<WorkspaceMigrationPlanV1> {
    const ctx: MigrationContext = {
      productionRoot,
      publishingRoot,
      migrationRoot,
      backupRoot,
    };
    return planMigrations(ctx);
  }

  async function applyDataMigrations(
    input: WorkspaceMigrationApplyInputV1,
  ): Promise<WorkspaceMigrationReceiptV1> {
    const ctx: MigrationContext = {
      productionRoot,
      publishingRoot,
      migrationRoot,
      backupRoot,
    };
    return applyMigrations(ctx, input);
  }

  async function exportDiagnostics(): Promise<WorkspaceDiagnosticBundleV1> {
    const health = await getHealth({ mode: 'quick' });
    const productionSummaries = listProductionSummaries().slice(0, 50).map((r) =>
      redactDiagnosticValue(r) as WorkspaceRunSummaryV1);
    const publishingSummaries = listPublishingSummaries().slice(0, 50).map((r) =>
      redactDiagnosticValue(r) as WorkspaceRunSummaryV1);
    const failedOperations = collectOperations()
      .filter((o) => o.status === 'failed' || o.status === 'reconciliation-required')
      .slice(0, 50)
      .map((o) => redactDiagnosticValue(o) as WorkspaceOperationViewV1);
    const recentDiagnostics: WorkspaceDiagnostic[] = [
      ...health.errors,
      ...health.warnings,
      ...failedOperations.map((o) => o.error).filter(Boolean) as WorkspaceDiagnostic[],
    ].slice(0, 100).map((d) => redactDiagnosticValue(d) as WorkspaceDiagnostic);

    const body = {
      schemaVersion: '1.0.0' as const,
      app: {
        version: appVersion,
        runtime: `node-${process.version}`,
        desktop: Boolean(desktop),
      },
      health: redactDiagnosticValue(health) as WorkspaceHealthReportV1,
      runs: {
        production: productionSummaries,
        publishing: publishingSummaries,
      },
      failedOperations,
      recentDiagnostics,
      dataVersions: listDataVersions({ productionRoot, publishingRoot, migrationRoot, backupRoot }),
      redaction: {
        credentialsRemoved: true as const,
        absolutePathsRemoved: true as const,
        sourceCodeRemoved: true as const,
        projectContentRemoved: true as const,
      },
      generatedAt: nowIso(),
    };
    const bundleHash = computeWorkspaceEntityHash({
      ...body,
      generatedAt: undefined,
    });
    return { ...body, bundleHash };
  }

  function getContract(format: 'summary' | 'full' = 'summary') {
    const summary = {
      schemaVersion: '1.0.0',
      name: 'Better Chat Cut Production Workspace',
      milestone: 'M7A',
      tools: [
        'workspace_get_contract',
        'workspace_get_overview',
        'workspace_get_run_detail',
        'workspace_list_reviews',
        'workspace_health_check',
        'workspace_plan_migrations',
        'workspace_apply_migrations',
        'workspace_export_diagnostics',
      ],
      apiRoutes: [
        'GET /api/better-chat-cut/workspace/overview',
        'GET /api/better-chat-cut/workspace/production-runs/:runId',
        'GET /api/better-chat-cut/workspace/publishing-runs/:runId',
        'GET /api/better-chat-cut/workspace/reviews',
        'GET /api/better-chat-cut/workspace/operations',
        'GET /api/better-chat-cut/workspace/health',
        'POST /api/better-chat-cut/workspace/commands',
        'POST /api/better-chat-cut/workspace/migrations/plan',
        'POST /api/better-chat-cut/workspace/migrations/apply',
        'POST /api/better-chat-cut/workspace/diagnostics/export',
      ],
      limitations: [
        'No built-in AI research/script/storyboard generation',
        'No multi-platform publishing',
        'No signed installers or automatic updater',
        'No credentials in browser storage',
        'No auto-approve reviews or auto-public release',
      ],
    };
    if (format === 'summary') return summary;
    return {
      ...summary,
      roots: {
        production: 'BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT',
        publishing: 'BETTER_CHAT_CUT_PUBLISHING_ROOT',
        migrations: 'BETTER_CHAT_CUT_WORKSPACE_MIGRATION_ROOT',
        backups: 'BETTER_CHAT_CUT_WORKSPACE_BACKUP_ROOT',
      },
    };
  }

  return {
    production,
    publishing,
    productionRoot,
    publishingRoot,
    migrationRoot,
    backupRoot,
    getContract,
    getOverview,
    getProductionRunDetail,
    getPublishingRunDetail,
    listReviews,
    listOperations: async () => collectOperations(),
    executeCommand,
    getHealth,
    planMigrations: planDataMigrations,
    applyMigrations: applyDataMigrations,
    exportDiagnostics,
  };
}

export type ProductionWorkspaceService = ReturnType<typeof createProductionWorkspaceService>;

// re-export helpers used by tests that need fs fixtures
export {
  accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync,
  writeFileSync, unlinkSync, copyFileSync, rmSync, join, resolve, tmpdir,
  randomUUID, createHash, sha256Hex, stableStringify,
};
