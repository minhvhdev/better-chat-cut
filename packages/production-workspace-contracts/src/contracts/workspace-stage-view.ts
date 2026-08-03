import type { WorkspaceActionDescriptorV1 } from './workspace-action.ts';
import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';

export type WorkspaceStageViewV1 = {
  id: string;
  label: string;
  status: string;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  inputArtifacts: { type: string; hash: string }[];
  outputArtifacts: { type: string; hash: string }[];
  review?: {
    reviewId: string;
    status: string;
  };
  externalOperation?: {
    type: string;
    id: string;
    status?: string;
  };
  blockers: WorkspaceDiagnostic[];
  warnings: WorkspaceDiagnostic[];
  availableActions: WorkspaceActionDescriptorV1[];
};
