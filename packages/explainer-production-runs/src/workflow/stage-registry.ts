import type { ProductionArtifactType, ProductionStageId } from '../../../explainer-production-contracts/src/index.ts';
import { PRODUCTION_STAGE_IDS } from '../../../explainer-production-contracts/src/index.ts';
import type { ProductionRunV1, ProductionStageStateV1 } from '../contracts/production-run.ts';
import { STAGE_DEPENDENCIES } from './stage-dependencies.ts';

export type ProductionStageDescriptor = {
  id: ProductionStageId;
  requiredInputs: ProductionArtifactType[];
  possibleOutputs: ProductionArtifactType[];
  mutatesProject: boolean;
  usesExternalOperation: boolean;
  requiresReviewByDefault: boolean;
  optional?: boolean;
};

export const STAGE_DESCRIPTORS: Record<ProductionStageId, ProductionStageDescriptor> = {
  intake: {
    id: 'intake',
    requiredInputs: [],
    possibleOutputs: ['production-request'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  research: {
    id: 'research',
    requiredInputs: ['production-request'],
    possibleOutputs: ['research-brief'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  script: {
    id: 'script',
    requiredInputs: ['research-brief'],
    possibleOutputs: ['explainer-script'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  storyboard: {
    id: 'storyboard',
    requiredInputs: ['explainer-script'],
    possibleOutputs: ['storyboard'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  'asset-requirements': {
    id: 'asset-requirements',
    requiredInputs: ['storyboard'],
    possibleOutputs: ['asset-requirement-set'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'asset-resolution': {
    id: 'asset-resolution',
    requiredInputs: ['asset-requirement-set'],
    possibleOutputs: ['asset-plan'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'asset-authoring': {
    id: 'asset-authoring',
    requiredInputs: ['asset-plan'],
    possibleOutputs: ['asset-authoring-tasks', 'asset-plan'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
    optional: true,
  },
  'scene-composition': {
    id: 'scene-composition',
    requiredInputs: ['asset-plan', 'storyboard'],
    possibleOutputs: ['scene-draft-set'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'scene-review': {
    id: 'scene-review',
    requiredInputs: ['scene-draft-set'],
    possibleOutputs: ['scene-review-report'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  'video-plan': {
    id: 'video-plan',
    requiredInputs: ['scene-draft-set', 'storyboard'],
    possibleOutputs: ['video-plan'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'timeline-assembly': {
    id: 'timeline-assembly',
    requiredInputs: ['video-plan'],
    possibleOutputs: ['video-assembly-report'],
    mutatesProject: true,
    usesExternalOperation: true,
    requiresReviewByDefault: false,
  },
  'narration-plan': {
    id: 'narration-plan',
    requiredInputs: ['explainer-script', 'storyboard', 'video-plan'],
    possibleOutputs: ['narration-plan'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'narration-timing': {
    id: 'narration-timing',
    requiredInputs: ['narration-plan'],
    possibleOutputs: ['narration-timing'],
    mutatesProject: false,
    usesExternalOperation: true,
    requiresReviewByDefault: false,
  },
  'narration-application': {
    id: 'narration-application',
    requiredInputs: ['narration-timing'],
    possibleOutputs: ['narration-application-report'],
    mutatesProject: true,
    usesExternalOperation: true,
    requiresReviewByDefault: false,
  },
  'timeline-review': {
    id: 'timeline-review',
    requiredInputs: ['video-assembly-report', 'narration-application-report'],
    possibleOutputs: [],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  'production-preflight': {
    id: 'production-preflight',
    requiredInputs: ['video-assembly-report'],
    possibleOutputs: ['production-render-plan'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'production-render': {
    id: 'production-render',
    requiredInputs: ['production-render-plan'],
    possibleOutputs: ['production-render-operation', 'delivery-bundle-manifest'],
    mutatesProject: false,
    usesExternalOperation: true,
    requiresReviewByDefault: false,
  },
  'delivery-validation': {
    id: 'delivery-validation',
    requiredInputs: ['delivery-bundle-manifest'],
    possibleOutputs: ['delivery-validation-report'],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
  'delivery-review': {
    id: 'delivery-review',
    requiredInputs: ['delivery-validation-report'],
    possibleOutputs: [],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: true,
  },
  completion: {
    id: 'completion',
    requiredInputs: ['delivery-bundle-manifest'],
    possibleOutputs: [],
    mutatesProject: false,
    usesExternalOperation: false,
    requiresReviewByDefault: false,
  },
};

export function createInitialStageStates(): ProductionStageStateV1[] {
  return PRODUCTION_STAGE_IDS.map((stageId) => ({
    stageId,
    status: stageId === 'intake' ? 'ready' : 'pending',
    attempt: 0,
    inputArtifacts: [],
    outputArtifacts: [],
    errors: [],
    warnings: [],
  }));
}

export function getStageState(run: ProductionRunV1, stageId: ProductionStageId): ProductionStageStateV1 {
  const stage = run.stages.find((s) => s.stageId === stageId);
  if (!stage) throw new Error(`Missing stage state: ${stageId}`);
  return stage;
}

export function isDependencyComplete(run: ProductionRunV1, stageId: ProductionStageId): boolean {
  const deps = STAGE_DEPENDENCIES[stageId];
  return deps.every((dep) => {
    const state = getStageState(run, dep);
    return state.status === 'completed' || state.status === 'skipped';
  });
}

export function stageRequiresReview(run: ProductionRunV1, stageId: ProductionStageId): boolean {
  if (run.policy.reviewMode === 'manual') return true;
  if (run.policy.reviewMode === 'auto') {
    // never auto-bypass key safety reviews for delivery / facts when listed
    return false;
  }
  return run.policy.requiredReviewStages.includes(stageId)
    || STAGE_DESCRIPTORS[stageId].requiresReviewByDefault
    && run.policy.requiredReviewStages.includes(stageId);
}
