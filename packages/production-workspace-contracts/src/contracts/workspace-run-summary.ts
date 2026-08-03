export type WorkspaceRunSummaryV1 = {
  runType: 'production' | 'publishing';
  runId: string;
  name: string;
  status: string;
  currentStageId: string;
  projectId?: string;
  progress: {
    completedStages: number;
    totalStages: number;
    percent: number;
  };
  nextActionType?: string;
  pendingReviewCount: number;
  blockerCount: number;
  createdAt: string;
  updatedAt: string;
  invalid?: boolean;
  invalidReason?: string;
};
