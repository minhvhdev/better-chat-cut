import type { ProductionArtifactType, ProductionStageId } from '../../../explainer-production-contracts/src/index.ts';

export type ProductionReviewV1 = {
  schemaVersion: '1.0.0';
  reviewId: string;
  runId: string;
  stageId: ProductionStageId;
  artifactReferences: {
    artifactType: ProductionArtifactType;
    artifactHash: string;
  }[];
  previewReferences?: {
    type: 'scene-preview' | 'timeline-contact-sheet' | 'qa-contact-sheet';
    referenceId: string;
  }[];
  status: 'pending' | 'approved' | 'rejected';
  decision?: {
    notes?: string;
    requestedChanges?: string[];
  };
  createdAt: string;
  decidedAt?: string;
};
