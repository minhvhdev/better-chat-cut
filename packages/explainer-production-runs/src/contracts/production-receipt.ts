export type ProductionRunReceiptV1 = {
  requestId: string;
  inputHash: string;
  operation:
    | 'create-run'
    | 'put-artifact'
    | 'execute-stage'
    | 'review-stage'
    | 'resume-run'
    | 'cancel-run';
  runId: string;
  previousRevision?: number;
  resultingRevision: number;
  previousWorkflowFingerprint?: string;
  resultingWorkflowFingerprint: string;
  completedAt: string;
};
