import type { AssetSimilarityMatch } from '../../../global-asset-registry/src/asset-similarity.ts';
import type { AssetResolverDiagnostic } from './resolver-errors.ts';
import type {
  AssetResolutionCandidateSummaryV1,
  AssetRejectedCandidateSummaryV1,
  AssetResolutionConfidence,
  AssetResolutionStrategy,
  ResolvedAssetSelectionV1,
} from './resolution-candidate.ts';
import type { AssetCompositionRecipeV1 } from './composition-recipe.ts';
import type { AssetCreationBriefV1 } from './creation-brief.ts';

export type AssetDuplicateReviewV1 = {
  checked: boolean;
  exactOrLikelyDuplicates: AssetSimilarityMatch[];
  possibleDuplicates: AssetSimilarityMatch[];
  blocksCreationBrief: boolean;
  catalogRevision: string;
};

export type AssetResolutionDecisionV1 = {
  requirementId: string;
  scope?: {
    sceneId?: string;
    beatId?: string;
    shotId?: string;
  };
  priority: 'critical' | 'high' | 'normal' | 'low';
  optional: boolean;
  status: 'resolved' | 'partially-resolved' | 'unresolved' | 'blocked' | 'skipped';
  strategy: AssetResolutionStrategy;
  score?: number;
  confidence?: AssetResolutionConfidence;
  selection?: ResolvedAssetSelectionV1;
  composition?: AssetCompositionRecipeV1;
  candidates?: AssetResolutionCandidateSummaryV1[];
  rejectedCandidates?: AssetRejectedCandidateSummaryV1[];
  duplicateReview?: AssetDuplicateReviewV1;
  creationBrief?: AssetCreationBriefV1;
  diagnostics: AssetResolverDiagnostic[];
};
