import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';

export type WorkspaceReviewType =
  | 'research'
  | 'script'
  | 'storyboard'
  | 'asset-plan'
  | 'scene'
  | 'timeline'
  | 'delivery'
  | 'metadata'
  | 'thumbnail'
  | 'package'
  | 'release'
  | 'other';

export type WorkspaceReviewItemV1 = {
  reviewId: string;
  runType: 'production' | 'publishing';
  runId: string;
  runName: string;
  stageId: string;
  reviewType: WorkspaceReviewType;
  status: 'pending' | 'approved' | 'rejected' | 'stale';
  artifactReferences: { type: string; hash: string }[];
  remote?: {
    videoId: string;
    remoteFingerprint: string;
  };
  createdAt: string;
  decidedAt?: string;
  validationWarnings: WorkspaceDiagnostic[];
  previewAvailable: boolean;
};

export type WorkspaceReviewQueryV1 = {
  runType?: 'production' | 'publishing' | 'all';
  reviewType?: WorkspaceReviewType | 'all';
  status?: 'pending' | 'approved' | 'rejected' | 'stale' | 'all';
  projectId?: string;
  limit?: number;
  offset?: number;
};

export type WorkspaceReviewQueueV1 = {
  schemaVersion: '1.0.0';
  items: WorkspaceReviewItemV1[];
  total: number;
  limit: number;
  offset: number;
  generatedAt: string;
};
