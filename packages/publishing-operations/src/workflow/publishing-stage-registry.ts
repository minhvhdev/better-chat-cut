import {
  PUBLISHING_STAGE_IDS,
  type PublishingArtifactType,
  type PublishingStageId,
} from '../../../publishing-contracts/src/index.ts';
import type { PublishingRunV1, PublishingStageStateV1 } from '../contracts/publishing-run.ts';

export type PublishingStageDescriptor = {
  id: PublishingStageId;
  requiredInputs: PublishingArtifactType[];
  possibleOutputs: PublishingArtifactType[];
  usesExternalOperation: boolean;
  requiresReviewByDefault: boolean;
  optional?: boolean;
};

export const PUBLISHING_STAGE_DESCRIPTORS: Record<PublishingStageId, PublishingStageDescriptor> = {
  intake: {
    id: 'intake',
    requiredInputs: [],
    possibleOutputs: ['publishing-request'],
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  metadata: {
    id: 'metadata',
    requiredInputs: ['publishing-request'],
    possibleOutputs: ['publishing-metadata', 'publishing-compliance'],
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  thumbnail: {
    id: 'thumbnail',
    requiredInputs: ['publishing-metadata'],
    possibleOutputs: ['thumbnail-plan', 'thumbnail-artifact'],
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  package: {
    id: 'package',
    requiredInputs: ['publishing-metadata', 'publishing-compliance'],
    possibleOutputs: ['publishing-package', 'release-plan'],
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'package-review': {
    id: 'package-review',
    requiredInputs: ['publishing-package'],
    possibleOutputs: [],
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  'connection-preflight': {
    id: 'connection-preflight',
    requiredInputs: ['publishing-package'],
    possibleOutputs: [],
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  upload: {
    id: 'upload',
    requiredInputs: ['publishing-package'],
    possibleOutputs: ['upload-operation'],
    usesExternalOperation: true,
    requiresReviewByDefault: false,
  },
  'remote-processing': {
    id: 'remote-processing',
    requiredInputs: ['upload-operation'],
    possibleOutputs: [],
    usesExternalOperation: true,
    requiresReviewByDefault: false,
  },
  'remote-assets': {
    id: 'remote-assets',
    requiredInputs: ['upload-operation', 'thumbnail-artifact'],
    possibleOutputs: [],
    usesExternalOperation: true,
    requiresReviewByDefault: false,
    optional: true,
  },
  'remote-verification': {
    id: 'remote-verification',
    requiredInputs: ['upload-operation', 'remote-publication-snapshot'],
    possibleOutputs: ['remote-publication-snapshot'],
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'release-review': {
    id: 'release-review',
    requiredInputs: ['remote-publication-snapshot', 'release-plan'],
    possibleOutputs: [],
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  release: {
    id: 'release',
    requiredInputs: ['release-plan'],
    possibleOutputs: [],
    usesExternalOperation: true,
    requiresReviewByDefault: false,
  },
  'post-release-validation': {
    id: 'post-release-validation',
    requiredInputs: [],
    possibleOutputs: ['release-manifest'],
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  completion: {
    id: 'completion',
    requiredInputs: ['release-manifest'],
    possibleOutputs: [],
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
};

export function createInitialStageStates(): PublishingStageStateV1[] {
  return PUBLISHING_STAGE_IDS.map((stageId, index) => ({
    stageId,
    status: index === 0 ? 'ready' : 'pending',
    attempt: 0,
    inputArtifacts: [],
    outputArtifacts: [],
    errors: [],
    warnings: [],
  }));
}

export function getStageState(run: PublishingRunV1, stageId: PublishingStageId): PublishingStageStateV1 {
  const stage = run.stages.find((s) => s.stageId === stageId);
  if (!stage) throw new Error(`Missing stage ${stageId}`);
  return stage;
}

export function stageRequiresReview(run: PublishingRunV1, stageId: PublishingStageId): boolean {
  if (stageId === 'metadata') return run.workflow.metadataReview === 'manual';
  if (stageId === 'thumbnail') return run.workflow.thumbnailReview === 'manual';
  if (stageId === 'package-review') return run.workflow.packageReview === 'manual';
  if (stageId === 'release-review') return true;
  return PUBLISHING_STAGE_DESCRIPTORS[stageId].requiresReviewByDefault;
}
