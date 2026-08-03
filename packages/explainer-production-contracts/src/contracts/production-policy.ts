import type { ProductionStageId } from './production-stage-id.ts';

export type ExplainerProductionPolicyV1 = {
  reviewMode: 'manual' | 'review-key-stages' | 'auto';
  projectMutationApproval: 'manual' | 'auto';
  requiredReviewStages: ProductionStageId[];
  allowStagingAssets: boolean;
  allowAssetAuthoringTasks: boolean;
  allowTemporaryTts: boolean;
  requireFinalVoiceover: boolean;
  requireCaptions: boolean;
  requireSrt: boolean;
  requireVtt: boolean;
  productionQaGate: 'balanced' | 'strict';
  stopOnWarnings?: boolean;
  maximumStageRetries: number;
};

export const DEFAULT_EXPLAINER_PRODUCTION_POLICY: ExplainerProductionPolicyV1 = {
  reviewMode: 'review-key-stages',
  projectMutationApproval: 'manual',
  requiredReviewStages: [
    'research',
    'script',
    'storyboard',
    'scene-review',
    'timeline-review',
    'delivery-review',
  ],
  allowStagingAssets: false,
  allowAssetAuthoringTasks: true,
  allowTemporaryTts: true,
  requireFinalVoiceover: false,
  requireCaptions: true,
  requireSrt: true,
  requireVtt: true,
  productionQaGate: 'balanced',
  stopOnWarnings: false,
  maximumStageRetries: 3,
};
