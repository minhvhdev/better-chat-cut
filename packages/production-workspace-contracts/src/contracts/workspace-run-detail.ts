import type { WorkspaceArtifactViewV1, WorkspaceLineageViewV1 } from './workspace-artifact-view.ts';
import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';
import type { WorkspaceDeliveryViewV1, WorkspaceOperationViewV1 } from './workspace-operation-view.ts';
import type { WorkspaceReviewItemV1 } from './workspace-review-item.ts';
import type { WorkspaceStageViewV1 } from './workspace-stage-view.ts';

export type WorkspaceNextActionViewV1 = {
  type: string;
  stageId?: string;
  label: string;
  requirements?: string[];
  reviewId?: string;
  operationId?: string;
  operationType?: string;
  bundleId?: string;
  blockers?: WorkspaceDiagnostic[];
};

export type WorkspaceRunDetailV1 = {
  schemaVersion: '1.0.0';
  runType: 'production' | 'publishing';
  runId: string;
  revision: number;
  workflowFingerprint: string;
  name: string;
  status: string;
  currentStageId: string;
  project?: {
    projectId?: string;
    projectName?: string;
  };
  stages: WorkspaceStageViewV1[];
  artifacts: WorkspaceArtifactViewV1[];
  lineage: WorkspaceLineageViewV1;
  pendingAction?: WorkspaceNextActionViewV1;
  reviews: WorkspaceReviewItemV1[];
  operations: WorkspaceOperationViewV1[];
  delivery?: WorkspaceDeliveryViewV1;
  errors: WorkspaceDiagnostic[];
  warnings: WorkspaceDiagnostic[];
  invalid?: boolean;
  invalidReason?: string;
};
