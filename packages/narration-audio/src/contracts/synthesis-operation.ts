export type NarrationSynthesisOperationV1 = {
  operationId: string;
  requestId: string;
  narrationPlanId: string;
  narrationPlanHash: string;
  segmentId: string;
  sceneEntryId: string;
  synthesisInputHash: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  generationJobId?: string;
  artifactId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};
