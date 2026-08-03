import type { AssetKind } from '../../../global-asset-registry/src/asset-types.ts';
import type { AssetDuplicateReviewV1 } from './resolution-decision.ts';

export type AssetCreationBriefV1 = {
  requirementId: string;
  suggestedId: string;
  suggestedVersion: '0.1.0';
  name: string;
  description: string;
  suggestedKind?: AssetKind;
  categories: string[];
  tags: string[];
  aliases: string[];
  capabilities: string[];
  styleTags: string[];
  desiredProps?: Record<string, unknown>;
  preferredImplementationType: 'react-component' | 'remotion-component' | 'svg' | 'composite';
  duplicateReview: AssetDuplicateReviewV1;
  recommendedNextAction:
    | 'review-existing-assets'
    | 'create-draft-manifest'
    | 'omit-optional-requirement';
};
