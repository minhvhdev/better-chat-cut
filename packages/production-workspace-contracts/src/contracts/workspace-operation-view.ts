import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';

export type WorkspaceOperationViewV1 = {
  operationId: string;
  runType: 'production' | 'publishing';
  runId: string;
  type: string;
  status: string;
  progress: {
    phase: string;
    percent?: number;
    bytesUploaded?: number;
    totalBytes?: number;
  };
  updatedAt: string;
  createdAt: string;
  error?: WorkspaceDiagnostic;
  recoverable: boolean;
  recoveryActions: string[];
};

export type WorkspaceDeliveryArtifactViewV1 = {
  role: string;
  fileName: string;
  sha256: string;
  downloadUrl: string;
  mimeType?: string;
  byteLength?: number;
};

export type WorkspaceDeliveryViewV1 = {
  bundleId: string;
  manifestHash: string;
  qaStatus: string;
  artifacts: WorkspaceDeliveryArtifactViewV1[];
  completed: boolean;
};
