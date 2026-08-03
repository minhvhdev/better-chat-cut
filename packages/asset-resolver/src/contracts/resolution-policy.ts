import type { AssetStatus } from '../../../global-asset-registry/src/asset-types.ts';

export type AssetResolutionPolicyV1 = {
  allowedStatuses: AssetStatus[];
  requireRuntime: boolean;
  allowVariant: boolean;
  allowComposition: boolean;
  allowCreationBrief: boolean;
  allowDeprecatedExactPin: boolean;
  minimumScore: number;
  directPreferenceThreshold: number;
  candidateLimit: number;
  rejectedCandidateLimit: number;
  includeCandidates: boolean;
  includeRejectedCandidates: boolean;
  maximumCompositionParts: number;
  reusePreference: 'none' | 'balanced' | 'strong';
};

export const DEFAULT_RESOLUTION_POLICY: AssetResolutionPolicyV1 = {
  allowedStatuses: ['published'],
  requireRuntime: true,
  allowVariant: true,
  allowComposition: true,
  allowCreationBrief: true,
  allowDeprecatedExactPin: false,
  minimumScore: 0.6,
  directPreferenceThreshold: 0.78,
  candidateLimit: 5,
  rejectedCandidateLimit: 5,
  includeCandidates: true,
  includeRejectedCandidates: false,
  maximumCompositionParts: 8,
  reusePreference: 'balanced',
};
