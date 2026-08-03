import type { AssetRequirementV1 } from './asset-requirement.ts';
import type { AssetResolutionPolicyV1 } from './resolution-policy.ts';

export const ASSET_REQUIREMENT_SCHEMA_VERSION = '1.0.0' as const;

export type AssetRequirementSetV1 = {
  schemaVersion: typeof ASSET_REQUIREMENT_SCHEMA_VERSION;
  id: string;
  name?: string;
  description?: string;
  theme?: {
    id: string;
    version: string;
  };
  defaultPolicy?: Partial<AssetResolutionPolicyV1>;
  requirements: AssetRequirementV1[];
};

export const ASSET_REQUIREMENT_LIMITS = {
  MAX_SERIALIZED_BYTES: 1 * 1024 * 1024,
  MAX_REQUIREMENTS: 100,
  MAX_COMPOSITION_PARTS: 12,
  MAX_COMPOSITION_DEPTH: 1,
  MAX_QUERIES_PER_REQUIREMENT: 10,
  MAX_QUERY_LENGTH: 256,
  MAX_METADATA_VALUES_PER_FIELD: 64,
  MAX_CANDIDATES_PER_REQUIREMENT: 20,
  MAX_INITIAL_CANDIDATES_PER_SIGNATURE: 100,
  MAX_TOTAL_CANDIDATE_EVALUATIONS: 50_000,
} as const;
