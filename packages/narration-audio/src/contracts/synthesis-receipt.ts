export type NarrationSynthesisReceiptV1 = {
  requestId: string;
  narrationPlanId: string;
  narrationPlanHash: string;
  synthesisInputHash: string;
  segmentId: string;
  status: 'dry-run' | 'cache-hit' | 'submitted' | 'succeeded' | 'failed';
  operationId?: string;
  artifactId?: string;
};
