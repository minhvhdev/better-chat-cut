import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';
import type { WorkspaceOperationViewV1 } from './workspace-operation-view.ts';
import type { WorkspaceReviewItemV1 } from './workspace-review-item.ts';
import type { WorkspaceRunSummaryV1 } from './workspace-run-summary.ts';

export type WorkspaceOverviewQueryV1 = {
  projectId?: string;
  runType?: 'production' | 'publishing' | 'all';
  status?: string[];
  stageId?: string;
  search?: string;
  sortBy?: 'updatedAt' | 'createdAt' | 'status';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeHealth?: boolean;
};

export type WorkspaceOverviewV1 = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  counts: {
    activeProductionRuns: number;
    waitingProductionRuns: number;
    blockedProductionRuns: number;
    completedProductionRuns: number;
    activePublishingRuns: number;
    waitingPublishingRuns: number;
    blockedPublishingRuns: number;
    completedPublishingRuns: number;
    pendingReviews: number;
    activeOperations: number;
    failedOperations: number;
  };
  recentRuns: WorkspaceRunSummaryV1[];
  pendingReviews: WorkspaceReviewItemV1[];
  activeOperations: WorkspaceOperationViewV1[];
  healthSummary: {
    status: 'healthy' | 'warning' | 'error';
    issueCount: number;
  };
  errors: WorkspaceDiagnostic[];
  warnings: WorkspaceDiagnostic[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};
