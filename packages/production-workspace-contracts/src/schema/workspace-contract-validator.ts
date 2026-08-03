import type { WorkspaceOverviewQueryV1 } from '../contracts/workspace-overview.ts';
import type { WorkspaceReviewQueryV1 } from '../contracts/workspace-review-item.ts';
import type { WorkspaceHealthOptionsV1 } from '../contracts/workspace-health.ts';
import type { WorkspaceMigrationApplyInputV1 } from '../contracts/workspace-migration.ts';
import type { WorkspaceCommandV1, WorkspaceCommandResultV1 } from '../contracts/workspace-command.ts';
import type { WorkspaceOverviewV1 } from '../contracts/workspace-overview.ts';
import type { WorkspaceRunDetailV1 } from '../contracts/workspace-run-detail.ts';
import type { WorkspaceHealthReportV1 } from '../contracts/workspace-health.ts';
import type { WorkspaceDiagnosticBundleV1 } from '../contracts/workspace-diagnostic-bundle.ts';
import type { WorkspaceMigrationPlanV1 } from '../contracts/workspace-migration.ts';
import { asRecord, deepCloneJson } from './serialization.ts';
import { workspaceDiagnostic, type WorkspaceDiagnostic } from '../contracts/workspace-diagnostic.ts';

export type WorkspaceValidationResult<T> = {
  valid: boolean;
  value?: T;
  errors: WorkspaceDiagnostic[];
  warnings: WorkspaceDiagnostic[];
};

function fail<T>(code: string, message: string, path?: string): WorkspaceValidationResult<T> {
  return {
    valid: false,
    errors: [workspaceDiagnostic('error', code, message, { path })],
    warnings: [],
  };
}

function ok<T>(value: T, warnings: WorkspaceDiagnostic[] = []): WorkspaceValidationResult<T> {
  return { valid: true, value, errors: [], warnings };
}

export function validateWorkspaceOverviewQuery(raw: unknown): WorkspaceValidationResult<WorkspaceOverviewQueryV1> {
  if (raw == null) return ok({});
  const r = asRecord(raw);
  if (!r) return fail('WORKSPACE_VALIDATION_FAILED', 'Overview query must be an object');
  if (r.runType !== undefined && !['production', 'publishing', 'all'].includes(String(r.runType))) {
    return fail('WORKSPACE_VALIDATION_FAILED', 'Invalid runType', 'runType');
  }
  const limit = r.limit === undefined ? undefined : Number(r.limit);
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 100)) {
    return fail('WORKSPACE_VALIDATION_FAILED', 'limit must be 1..100', 'limit');
  }
  return ok({
    projectId: typeof r.projectId === 'string' ? r.projectId : undefined,
    runType: r.runType as WorkspaceOverviewQueryV1['runType'],
    status: Array.isArray(r.status) ? r.status.map(String) : undefined,
    stageId: typeof r.stageId === 'string' ? r.stageId : undefined,
    search: typeof r.search === 'string' ? r.search : undefined,
    sortBy: r.sortBy === 'createdAt' || r.sortBy === 'status' || r.sortBy === 'updatedAt' ? r.sortBy : undefined,
    sortDir: r.sortDir === 'asc' || r.sortDir === 'desc' ? r.sortDir : undefined,
    limit,
    offset: r.offset === undefined ? undefined : Math.max(0, Number(r.offset) || 0),
    includeHealth: r.includeHealth === false ? false : true,
  });
}

export function validateWorkspaceReviewQuery(raw: unknown): WorkspaceValidationResult<WorkspaceReviewQueryV1> {
  if (raw == null) return ok({});
  const r = asRecord(raw);
  if (!r) return fail('WORKSPACE_VALIDATION_FAILED', 'Review query must be an object');
  return ok({
    runType: r.runType as WorkspaceReviewQueryV1['runType'],
    reviewType: r.reviewType as WorkspaceReviewQueryV1['reviewType'],
    status: r.status as WorkspaceReviewQueryV1['status'],
    projectId: typeof r.projectId === 'string' ? r.projectId : undefined,
    limit: r.limit === undefined ? undefined : Math.min(100, Math.max(1, Number(r.limit) || 20)),
    offset: r.offset === undefined ? undefined : Math.max(0, Number(r.offset) || 0),
  });
}

export function validateWorkspaceHealthOptions(raw: unknown): WorkspaceValidationResult<WorkspaceHealthOptionsV1> {
  if (raw == null) return ok({ mode: 'quick' });
  const r = asRecord(raw);
  if (!r) return fail('WORKSPACE_VALIDATION_FAILED', 'Health options must be an object');
  const mode = r.mode === 'deep' ? 'deep' : 'quick';
  return ok({
    mode,
    includeMigrations: r.includeMigrations !== false,
    includeDesktop: r.includeDesktop === true,
  });
}

export function validateWorkspaceMigrationApply(
  raw: unknown,
): WorkspaceValidationResult<WorkspaceMigrationApplyInputV1> {
  const r = asRecord(raw);
  if (!r) return fail('WORKSPACE_VALIDATION_FAILED', 'Migration apply input required');
  if (typeof r.planId !== 'string' || !r.planId) return fail('WORKSPACE_VALIDATION_FAILED', 'planId required', 'planId');
  if (typeof r.planHash !== 'string' || !/^[a-f0-9]{64}$/i.test(r.planHash)) {
    return fail('WORKSPACE_VALIDATION_FAILED', 'planHash must be sha256 hex', 'planHash');
  }
  return ok({
    planId: r.planId,
    planHash: r.planHash.toLowerCase(),
    dryRun: r.dryRun === true,
    confirmDestructive: r.confirmDestructive === true,
  });
}

const COMMAND_TYPES = new Set([
  'create-production-run',
  'put-production-artifact',
  'execute-production-stage',
  'review-production-stage',
  'resume-production-run',
  'cancel-production-run',
  'create-publishing-run',
  'put-publishing-artifact',
  'execute-publishing-stage',
  'review-publishing-stage',
  'resume-publishing-run',
  'cancel-publishing-run',
]);

export function validateWorkspaceCommand(raw: unknown): WorkspaceValidationResult<WorkspaceCommandV1> {
  const r = asRecord(raw);
  if (!r) return fail('WORKSPACE_COMMAND_INVALID', 'Command must be an object');
  if (typeof r.type !== 'string' || !COMMAND_TYPES.has(r.type)) {
    return fail('WORKSPACE_COMMAND_UNSUPPORTED', `Unsupported command type: ${String(r.type)}`, 'type');
  }
  if (typeof r.requestId !== 'string' || !r.requestId.trim()) {
    return fail('WORKSPACE_COMMAND_INVALID', 'requestId required', 'requestId');
  }
  const needsGuard = !['create-production-run', 'create-publishing-run'].includes(r.type);
  if (needsGuard) {
    if (typeof r.runId !== 'string' || !r.runId) {
      return fail('WORKSPACE_COMMAND_INVALID', 'runId required', 'runId');
    }
    if (typeof r.expectedRevision !== 'number' || !Number.isInteger(r.expectedRevision) || r.expectedRevision < 0) {
      return fail('WORKSPACE_COMMAND_INVALID', 'expectedRevision required', 'expectedRevision');
    }
    if (typeof r.expectedWorkflowFingerprint !== 'string' || !r.expectedWorkflowFingerprint) {
      return fail('WORKSPACE_COMMAND_INVALID', 'expectedWorkflowFingerprint required', 'expectedWorkflowFingerprint');
    }
  }
  if (r.type === 'create-production-run' && !asRecord(r.productionRequest)) {
    return fail('WORKSPACE_COMMAND_INVALID', 'productionRequest required', 'productionRequest');
  }
  if (r.type === 'create-publishing-run' && !asRecord(r.publishingRequest)) {
    return fail('WORKSPACE_COMMAND_INVALID', 'publishingRequest required', 'publishingRequest');
  }
  if (r.type === 'review-production-stage' || r.type === 'review-publishing-stage') {
    if (typeof r.reviewId !== 'string' || !r.reviewId) {
      return fail('WORKSPACE_COMMAND_INVALID', 'reviewId required', 'reviewId');
    }
    if (r.decision !== 'approve' && r.decision !== 'reject') {
      return fail('WORKSPACE_COMMAND_INVALID', 'decision must be approve|reject', 'decision');
    }
  }
  return ok(deepCloneJson(r) as WorkspaceCommandV1);
}

export function validateWorkspaceOverview(raw: unknown): WorkspaceValidationResult<WorkspaceOverviewV1> {
  const r = asRecord(raw);
  if (!r || r.schemaVersion !== '1.0.0') return fail('WORKSPACE_VALIDATION_FAILED', 'Invalid overview schema');
  return ok(raw as WorkspaceOverviewV1);
}

export function validateWorkspaceRunDetail(raw: unknown): WorkspaceValidationResult<WorkspaceRunDetailV1> {
  const r = asRecord(raw);
  if (!r || r.schemaVersion !== '1.0.0') return fail('WORKSPACE_VALIDATION_FAILED', 'Invalid run detail schema');
  if (r.runType !== 'production' && r.runType !== 'publishing') {
    return fail('WORKSPACE_VALIDATION_FAILED', 'runType required', 'runType');
  }
  if (typeof r.runId !== 'string') return fail('WORKSPACE_VALIDATION_FAILED', 'runId required', 'runId');
  return ok(raw as WorkspaceRunDetailV1);
}

export function validateWorkspaceCommandResult(raw: unknown): WorkspaceValidationResult<WorkspaceCommandResultV1> {
  const r = asRecord(raw);
  if (!r || r.schemaVersion !== '1.0.0') return fail('WORKSPACE_VALIDATION_FAILED', 'Invalid command result');
  return ok(raw as WorkspaceCommandResultV1);
}

export function validateWorkspaceHealthReport(raw: unknown): WorkspaceValidationResult<WorkspaceHealthReportV1> {
  const r = asRecord(raw);
  if (!r || r.schemaVersion !== '1.0.0') return fail('WORKSPACE_VALIDATION_FAILED', 'Invalid health report');
  return ok(raw as WorkspaceHealthReportV1);
}

export function validateWorkspaceMigrationPlan(raw: unknown): WorkspaceValidationResult<WorkspaceMigrationPlanV1> {
  const r = asRecord(raw);
  if (!r || r.schemaVersion !== '1.0.0') return fail('WORKSPACE_VALIDATION_FAILED', 'Invalid migration plan');
  if (typeof r.planHash !== 'string' || !/^[a-f0-9]{64}$/i.test(r.planHash)) {
    return fail('WORKSPACE_VALIDATION_FAILED', 'planHash required', 'planHash');
  }
  return ok(raw as WorkspaceMigrationPlanV1);
}

export function validateWorkspaceDiagnosticBundle(
  raw: unknown,
): WorkspaceValidationResult<WorkspaceDiagnosticBundleV1> {
  const r = asRecord(raw);
  if (!r || r.schemaVersion !== '1.0.0') return fail('WORKSPACE_VALIDATION_FAILED', 'Invalid diagnostic bundle');
  if (typeof r.bundleHash !== 'string') return fail('WORKSPACE_VALIDATION_FAILED', 'bundleHash required');
  return ok(raw as WorkspaceDiagnosticBundleV1);
}
