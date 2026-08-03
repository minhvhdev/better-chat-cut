import type {
  AssetImplementationType,
  AssetKind,
  AssetStatus,
} from '../../../global-asset-registry/src/asset-types.ts';

export type AssetResolutionConfidence = 'exact' | 'high' | 'medium' | 'low';

export type AssetResolutionStrategy =
  | 'exact'
  | 'reuse'
  | 'variant'
  | 'composition'
  | 'review-duplicate'
  | 'create-new'
  | 'none';

export type AssetResolutionReason = {
  code: string;
  message: string;
  contribution?: number;
  details?: Record<string, unknown>;
};

export type ResolvedAssetSelectionV1 = {
  asset: {
    id: string;
    version: string;
    name: string;
    kind: AssetKind;
    status: AssetStatus;
    contentHash: string;
    implementationFingerprint?: string;
    implementationType: AssetImplementationType;
    runtimeAvailable: boolean;
  };
  props: Record<string, unknown>;
  fitHint: 'contain' | 'cover' | 'stretch';
  score: number;
  confidence: AssetResolutionConfidence;
  matchedFields: string[];
  reasons: AssetResolutionReason[];
};

export type AssetResolutionCandidateSummaryV1 = {
  assetId: string;
  assetVersion: string;
  score: number;
  confidence: AssetResolutionConfidence;
  status: AssetStatus;
  kind: AssetKind;
  runtimeAvailable: boolean;
  matchedFields: string[];
  reasons: AssetResolutionReason[];
};

export type AssetRejectedCandidateSummaryV1 = {
  assetId: string;
  assetVersion: string;
  reasonCodes: string[];
  reasons: AssetResolutionReason[];
};
