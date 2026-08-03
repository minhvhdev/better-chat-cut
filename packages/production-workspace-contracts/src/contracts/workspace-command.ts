import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';

export type WorkspaceCommandBase = {
  requestId: string;
  dryRun?: boolean;
};

export type WorkspaceCreateProductionRunCommandV1 = WorkspaceCommandBase & {
  type: 'create-production-run';
  productionRequest: Record<string, unknown>;
};

export type WorkspacePutProductionArtifactCommandV1 = WorkspaceCommandBase & {
  type: 'put-production-artifact';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  artifactType: 'research-brief' | 'explainer-script' | 'storyboard';
  artifact: unknown;
};

export type WorkspaceExecuteProductionStageCommandV1 = WorkspaceCommandBase & {
  type: 'execute-production-stage';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  stageId?: string;
  editSessionId?: string;
  stageInput?: Record<string, unknown>;
};

export type WorkspaceReviewProductionStageCommandV1 = WorkspaceCommandBase & {
  type: 'review-production-stage';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  reviewId: string;
  decision: 'approve' | 'reject';
  notes?: string;
  requestedChanges?: string[];
};

export type WorkspaceResumeProductionRunCommandV1 = WorkspaceCommandBase & {
  type: 'resume-production-run';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
};

export type WorkspaceCancelProductionRunCommandV1 = WorkspaceCommandBase & {
  type: 'cancel-production-run';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  reason?: string;
};

export type WorkspaceCreatePublishingRunCommandV1 = WorkspaceCommandBase & {
  type: 'create-publishing-run';
  publishingRequest: Record<string, unknown>;
};

export type WorkspacePutPublishingArtifactCommandV1 = WorkspaceCommandBase & {
  type: 'put-publishing-artifact';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  artifactType: 'publishing-metadata' | 'publishing-compliance' | 'thumbnail-plan' | 'release-plan';
  artifact: unknown;
};

export type WorkspaceExecutePublishingStageCommandV1 = WorkspaceCommandBase & {
  type: 'execute-publishing-stage';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  stageId?: string;
  stageInput?: Record<string, unknown>;
};

export type WorkspaceReviewPublishingStageCommandV1 = WorkspaceCommandBase & {
  type: 'review-publishing-stage';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  reviewId: string;
  decision: 'approve' | 'reject';
  notes?: string;
  requestedChanges?: string[];
};

export type WorkspaceResumePublishingRunCommandV1 = WorkspaceCommandBase & {
  type: 'resume-publishing-run';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
};

export type WorkspaceCancelPublishingRunCommandV1 = WorkspaceCommandBase & {
  type: 'cancel-publishing-run';
  runId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  reason?: string;
};

export type WorkspaceCommandV1 =
  | WorkspaceCreateProductionRunCommandV1
  | WorkspacePutProductionArtifactCommandV1
  | WorkspaceExecuteProductionStageCommandV1
  | WorkspaceReviewProductionStageCommandV1
  | WorkspaceResumeProductionRunCommandV1
  | WorkspaceCancelProductionRunCommandV1
  | WorkspaceCreatePublishingRunCommandV1
  | WorkspacePutPublishingArtifactCommandV1
  | WorkspaceExecutePublishingStageCommandV1
  | WorkspaceReviewPublishingStageCommandV1
  | WorkspaceResumePublishingRunCommandV1
  | WorkspaceCancelPublishingRunCommandV1;

export type WorkspaceCommandResultV1 = {
  schemaVersion: '1.0.0';
  dryRun: boolean;
  commandType: WorkspaceCommandV1['type'];
  runType?: 'production' | 'publishing';
  runId?: string;
  revision?: number;
  workflowFingerprint?: string;
  nextActionType?: string;
  changeSummary?: string[];
  data?: unknown;
  errors: WorkspaceDiagnostic[];
  warnings: WorkspaceDiagnostic[];
};
