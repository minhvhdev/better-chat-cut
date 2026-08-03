import type { WorkspaceRunSummaryV1 } from '../contracts/workspace-run-summary.ts';
import type { WorkspaceDiagnostic } from '../contracts/workspace-diagnostic.ts';
import type { WorkspaceActionDescriptorV1 } from '../contracts/workspace-action.ts';
import type { WorkspaceStageViewV1 } from '../contracts/workspace-stage-view.ts';
import type { WorkspaceNextActionViewV1 } from '../contracts/workspace-run-detail.ts';
import type { WorkspaceReviewItemV1, WorkspaceReviewType } from '../contracts/workspace-review-item.ts';
import type { WorkspaceOperationViewV1 } from '../contracts/workspace-operation-view.ts';
import type { WorkspaceArtifactViewV1, WorkspaceLineageViewV1 } from '../contracts/workspace-artifact-view.ts';

export type ProductionRunLike = {
  runId: string;
  requestId: string;
  status: string;
  currentStageId: string;
  revision: number;
  workflowFingerprint: string;
  createdAt: string;
  updatedAt: string;
  project?: { expectedProjectId?: string; boundProjectId?: string };
  stages: Array<{
    stageId: string;
    status: string;
    attempt: number;
    startedAt?: string;
    completedAt?: string;
    inputArtifacts: Array<{ artifactType: string; artifactHash: string }>;
    outputArtifacts: Array<{ artifactType: string; artifactHash: string }>;
    review?: { reviewId: string; status: string };
    externalOperation?: { type: string; id: string; status?: string };
    errors: WorkspaceDiagnostic[];
    warnings: WorkspaceDiagnostic[];
  }>;
  artifacts: Array<{ artifactType: string; artifactHash: string }>;
  delivery?: { bundleId: string; manifestHash: string; validationStatus?: string };
};

export type PublishingRunLike = {
  runId: string;
  requestId: string;
  status: string;
  currentStageId: string;
  revision: number;
  workflowFingerprint: string;
  createdAt: string;
  updatedAt: string;
  source: { productionRunId: string; bundleId: string; deliveryManifestHash: string };
  stages: Array<{
    stageId: string;
    status: string;
    attempt: number;
    inputArtifacts: Array<{ artifactType: string; artifactHash: string }>;
    outputArtifacts: Array<{ artifactType: string; artifactHash: string }>;
    review?: { reviewId: string; status: string };
    externalOperation?: { type: string; id: string; status?: string };
    errors: WorkspaceDiagnostic[];
    warnings: WorkspaceDiagnostic[];
  }>;
  artifacts: Array<{ artifactType: string; artifactHash: string }>;
  upload?: { operationId: string; remoteVideoId?: string; remoteFingerprint?: string };
};

function stageLabel(stageId: string): string {
  return stageId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function progressFromStages(stages: Array<{ status: string }>): WorkspaceRunSummaryV1['progress'] {
  const total = stages.length || 1;
  const completed = stages.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  return {
    completedStages: completed,
    totalStages: total,
    percent: Math.round((completed / total) * 100),
  };
}

function countPendingReviews(stages: Array<{ review?: { status: string } }>): number {
  return stages.filter((s) => s.review?.status === 'pending').length;
}

function countBlockers(stages: Array<{ status: string; errors: unknown[] }>): number {
  return stages.reduce((n, s) => {
    if (s.status === 'blocked' || s.status === 'failed') return n + Math.max(1, s.errors.length);
    return n + s.errors.length;
  }, 0);
}

const PRODUCTION_REVIEW_TYPE: Record<string, WorkspaceReviewType> = {
  research: 'research',
  script: 'script',
  storyboard: 'storyboard',
  'asset-resolution': 'asset-plan',
  'scene-review': 'scene',
  'timeline-assembly': 'timeline',
  delivery: 'delivery',
};

const PUBLISHING_REVIEW_TYPE: Record<string, WorkspaceReviewType> = {
  metadata: 'metadata',
  thumbnail: 'thumbnail',
  'package-review': 'package',
  'release-review': 'release',
};

export function selectProductionRunSummary(
  run: ProductionRunLike,
  nextActionType?: string,
  name?: string,
): WorkspaceRunSummaryV1 {
  return {
    runType: 'production',
    runId: run.runId,
    name: name ?? run.requestId,
    status: run.status,
    currentStageId: run.currentStageId,
    projectId: run.project?.boundProjectId ?? run.project?.expectedProjectId,
    progress: progressFromStages(run.stages),
    nextActionType,
    pendingReviewCount: countPendingReviews(run.stages),
    blockerCount: countBlockers(run.stages),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function selectPublishingRunSummary(
  run: PublishingRunLike,
  nextActionType?: string,
  name?: string,
): WorkspaceRunSummaryV1 {
  return {
    runType: 'publishing',
    runId: run.runId,
    name: name ?? run.requestId,
    status: run.status,
    currentStageId: run.currentStageId,
    progress: progressFromStages(run.stages),
    nextActionType,
    pendingReviewCount: countPendingReviews(run.stages),
    blockerCount: countBlockers(run.stages),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function selectUnifiedRunSummaries(
  production: WorkspaceRunSummaryV1[],
  publishing: WorkspaceRunSummaryV1[],
): WorkspaceRunSummaryV1[] {
  return [...production, ...publishing].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function actionsForProductionStage(
  run: ProductionRunLike,
  stage: ProductionRunLike['stages'][number],
  next?: { type: string; stageId?: string },
): WorkspaceActionDescriptorV1[] {
  const actions: WorkspaceActionDescriptorV1[] = [];
  const isCurrent = stage.stageId === run.currentStageId;
  if (stage.review?.status === 'pending') {
    actions.push({
      id: `approve-${stage.review.reviewId}`,
      type: 'approve-review',
      label: 'Approve review',
      enabled: true,
      destructive: false,
      requiresConfirmation: true,
    });
    actions.push({
      id: `reject-${stage.review.reviewId}`,
      type: 'reject-review',
      label: 'Reject review',
      enabled: true,
      destructive: true,
      requiresConfirmation: true,
    });
  }
  if (isCurrent && next?.type === 'put-artifact') {
    actions.push({
      id: `put-${stage.stageId}`,
      type: 'put-artifact',
      label: 'Save artifact',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
  }
  if (isCurrent && next?.type === 'execute-stage') {
    actions.push({
      id: `execute-${stage.stageId}`,
      type: 'execute-stage',
      label: 'Execute stage',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
  }
  if (isCurrent && next?.type === 'open-edit-session') {
    actions.push({
      id: `open-edit-${stage.stageId}`,
      type: 'open-edit-session-review',
      label: 'Open project proposal review',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
  }
  if (run.status !== 'completed' && run.status !== 'cancelled') {
    actions.push({
      id: `resume-${run.runId}`,
      type: 'resume',
      label: 'Resume',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
    actions.push({
      id: `cancel-${run.runId}`,
      type: 'cancel',
      label: 'Cancel run',
      enabled: true,
      destructive: true,
      requiresConfirmation: true,
    });
  }
  if (run.project?.boundProjectId || run.project?.expectedProjectId) {
    actions.push({
      id: `open-project-${run.runId}`,
      type: 'open-project',
      label: 'Open project',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
  }
  return actions;
}

function actionsForPublishingStage(
  run: PublishingRunLike,
  stage: PublishingRunLike['stages'][number],
  next?: { type: string },
): WorkspaceActionDescriptorV1[] {
  const actions: WorkspaceActionDescriptorV1[] = [];
  if (stage.review?.status === 'pending') {
    actions.push({
      id: `approve-${stage.review.reviewId}`,
      type: 'approve-review',
      label: stage.stageId === 'release-review' ? 'Approve release' : 'Approve review',
      enabled: true,
      destructive: stage.stageId === 'release-review',
      requiresConfirmation: true,
    });
    actions.push({
      id: `reject-${stage.review.reviewId}`,
      type: 'reject-review',
      label: 'Reject review',
      enabled: true,
      destructive: true,
      requiresConfirmation: true,
    });
  }
  if (stage.stageId === run.currentStageId && next?.type === 'put-artifact') {
    actions.push({
      id: `put-${stage.stageId}`,
      type: 'put-artifact',
      label: 'Save artifact',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
  }
  if (stage.stageId === run.currentStageId && (next?.type === 'execute-stage' || next?.type === 'resume')) {
    actions.push({
      id: `execute-${stage.stageId}`,
      type: 'execute-stage',
      label: 'Continue stage',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
  }
  if (stage.stageId === 'connection-preflight') {
    actions.push({
      id: `inspect-${run.runId}`,
      type: 'inspect-connection',
      label: 'Inspect connection',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
  }
  if (run.status !== 'completed' && run.status !== 'cancelled') {
    actions.push({
      id: `resume-pub-${run.runId}`,
      type: 'resume',
      label: 'Resume',
      enabled: true,
      destructive: false,
      requiresConfirmation: false,
    });
    actions.push({
      id: `cancel-pub-${run.runId}`,
      type: 'cancel',
      label: 'Cancel run',
      enabled: true,
      destructive: true,
      requiresConfirmation: true,
    });
  }
  return actions;
}

export function selectProductionStageViews(
  run: ProductionRunLike,
  next?: { type: string; stageId?: string },
): WorkspaceStageViewV1[] {
  return run.stages.map((stage) => ({
    id: stage.stageId,
    label: stageLabel(stage.stageId),
    status: stage.status,
    attempt: stage.attempt,
    startedAt: stage.startedAt,
    completedAt: stage.completedAt,
    inputArtifacts: stage.inputArtifacts.map((a) => ({ type: a.artifactType, hash: a.artifactHash })),
    outputArtifacts: stage.outputArtifacts.map((a) => ({ type: a.artifactType, hash: a.artifactHash })),
    review: stage.review,
    externalOperation: stage.externalOperation,
    blockers: stage.errors as WorkspaceDiagnostic[],
    warnings: stage.warnings as WorkspaceDiagnostic[],
    availableActions: actionsForProductionStage(run, stage, next),
  }));
}

export function selectPublishingStageViews(
  run: PublishingRunLike,
  next?: { type: string },
): WorkspaceStageViewV1[] {
  return run.stages.map((stage) => ({
    id: stage.stageId,
    label: stageLabel(stage.stageId),
    status: stage.status,
    attempt: stage.attempt,
    inputArtifacts: stage.inputArtifacts.map((a) => ({ type: a.artifactType, hash: a.artifactHash })),
    outputArtifacts: stage.outputArtifacts.map((a) => ({ type: a.artifactType, hash: a.artifactHash })),
    review: stage.review,
    externalOperation: stage.externalOperation
      ? {
        type: stage.externalOperation.type,
        id: stage.externalOperation.id,
        status: stage.externalOperation.status,
      }
      : undefined,
    blockers: stage.errors as WorkspaceDiagnostic[],
    warnings: stage.warnings as WorkspaceDiagnostic[],
    availableActions: actionsForPublishingStage(run, stage, next),
  }));
}

export function selectNextActionView(next: {
  type: string;
  stageId?: string;
  requirements?: string[];
  reviewId?: string;
  operationType?: string;
  operationId?: string;
  bundleId?: string;
  blockers?: WorkspaceDiagnostic[];
} | null | undefined): WorkspaceNextActionViewV1 | undefined {
  if (!next) return undefined;
  const labels: Record<string, string> = {
    'put-artifact': 'Provide required artifact',
    'execute-stage': 'Execute ready stage',
    'open-edit-session': 'Open project edit session',
    'wait-external-operation': 'Wait for external operation',
    review: 'Complete review',
    'resolve-blocker': 'Resolve blocker',
    completed: 'Workflow completed',
    resume: 'Resume workflow',
    cancel: 'Cancel workflow',
  };
  return {
    type: next.type,
    stageId: next.stageId,
    label: labels[next.type] ?? next.type,
    requirements: next.requirements,
    reviewId: next.reviewId,
    operationId: next.operationId,
    operationType: next.operationType,
    bundleId: next.bundleId,
    blockers: next.blockers,
  };
}

export function selectReviewItemsFromProduction(
  run: ProductionRunLike,
  runName: string,
  reviews: Array<{
    reviewId: string;
    stageId: string;
    status: string;
    artifactReferences: Array<{ artifactType: string; artifactHash: string }>;
    createdAt: string;
    decidedAt?: string;
  }>,
): WorkspaceReviewItemV1[] {
  return reviews.map((review) => ({
    reviewId: review.reviewId,
    runType: 'production' as const,
    runId: run.runId,
    runName,
    stageId: review.stageId,
    reviewType: PRODUCTION_REVIEW_TYPE[review.stageId] ?? 'other',
    status: review.status as WorkspaceReviewItemV1['status'],
    artifactReferences: review.artifactReferences.map((a) => ({ type: a.artifactType, hash: a.artifactHash })),
    createdAt: review.createdAt,
    decidedAt: review.decidedAt,
    validationWarnings: [],
    previewAvailable: ['scene', 'storyboard', 'delivery'].includes(PRODUCTION_REVIEW_TYPE[review.stageId] ?? ''),
  }));
}

export function selectReviewItemsFromPublishing(
  run: PublishingRunLike,
  runName: string,
  reviews: Array<{
    reviewId: string;
    stageId: string;
    status: string;
    artifactReferences: Array<{ artifactType: string; artifactHash: string }>;
    remote?: { videoId: string; remoteFingerprint: string };
    createdAt: string;
    decidedAt?: string;
  }>,
): WorkspaceReviewItemV1[] {
  return reviews.map((review) => ({
    reviewId: review.reviewId,
    runType: 'publishing' as const,
    runId: run.runId,
    runName,
    stageId: review.stageId,
    reviewType: PUBLISHING_REVIEW_TYPE[review.stageId] ?? 'other',
    status: review.status as WorkspaceReviewItemV1['status'],
    artifactReferences: review.artifactReferences.map((a) => ({ type: a.artifactType, hash: a.artifactHash })),
    remote: review.remote,
    createdAt: review.createdAt,
    decidedAt: review.decidedAt,
    validationWarnings: [],
    previewAvailable: review.stageId === 'thumbnail' || review.stageId === 'package-review',
  }));
}

export function selectArtifactViews(
  _runType: 'production' | 'publishing',
  artifacts: Array<{ artifactType: string; artifactHash: string }>,
  stages: Array<{ stageId: string; outputArtifacts: Array<{ artifactType: string; artifactHash: string }> }>,
): WorkspaceArtifactViewV1[] {
  const stageByType = new Map<string, string>();
  for (const stage of stages) {
    for (const out of stage.outputArtifacts) {
      stageByType.set(out.artifactType, stage.stageId);
    }
  }
  return artifacts.map((a) => {
    let previewKind: WorkspaceArtifactViewV1['previewKind'] = 'json';
    if (a.artifactType.includes('thumbnail')) previewKind = 'image';
    if (a.artifactType.includes('delivery') || a.artifactType.includes('upload')) previewKind = 'download';
    return {
      type: a.artifactType,
      hash: a.artifactHash,
      stageId: stageByType.get(a.artifactType),
      active: true,
      contentAvailable: true,
      previewKind,
    };
  });
}

export function selectLineageView(
  stages: Array<{
    stageId: string;
    inputArtifacts: Array<{ artifactType: string; artifactHash: string }>;
    outputArtifacts: Array<{ artifactType: string; artifactHash: string }>;
  }>,
): WorkspaceLineageViewV1 {
  const nodes: WorkspaceLineageViewV1['nodes'] = [];
  for (const stage of stages) {
    for (const out of stage.outputArtifacts) {
      nodes.push({
        type: out.artifactType,
        hash: out.artifactHash,
        parents: stage.inputArtifacts.map((i) => ({ type: i.artifactType, hash: i.artifactHash })),
      });
    }
  }
  return { nodes };
}

export function selectOperationsFromStages(
  runType: 'production' | 'publishing',
  runId: string,
  stages: Array<{
    externalOperation?: { type: string; id: string; status?: string };
    errors: WorkspaceDiagnostic[];
  }>,
  extra?: WorkspaceOperationViewV1[],
): WorkspaceOperationViewV1[] {
  const ops: WorkspaceOperationViewV1[] = [...(extra ?? [])];
  for (const stage of stages) {
    if (!stage.externalOperation) continue;
    const status = stage.externalOperation.status ?? 'unknown';
    const failed = status === 'failed' || status === 'reconciliation-required';
    ops.push({
      operationId: stage.externalOperation.id,
      runType,
      runId,
      type: stage.externalOperation.type,
      status,
      progress: { phase: status },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date().toISOString(),
      error: stage.errors[0],
      recoverable: failed,
      recoveryActions: failed
        ? ['resume', 'inspect-operation', 'export-diagnostics']
        : [],
    });
  }
  return ops;
}

export function isWaitingStatus(status: string): boolean {
  return (
    status.includes('awaiting')
    || status === 'reconciliation-required'
  );
}

export function isActiveStatus(status: string): boolean {
  return status === 'active' || status === 'running' || isWaitingStatus(status);
}

export function isBlockedStatus(status: string): boolean {
  return status === 'blocked' || status === 'failed';
}
