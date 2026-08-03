import { createHash } from 'node:crypto';
import { ASSET_REQUIREMENT_SCHEMA_VERSION } from '../contracts/asset-requirement-set.ts';
import { ASSET_PLAN_SCHEMA_VERSION } from '../contracts/asset-plan.ts';
import {
  ASSET_RESOLVER_SCORE_WEIGHTS,
  COMPOSITION_PART_COMPLEXITY_PENALTY,
  COMPOSITION_SWITCH_MARGIN,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  COMPOSITION_CONTRACT_VERSION,
  DUPLICATE_CONTRACT_VERSION,
  NORMALIZATION_CONTRACT_VERSION,
  PLANNING_CONTRACT_VERSION,
  SCORING_CONTRACT_VERSION,
  STRATEGY_CONTRACT_VERSION,
  TIEBREAK_CONTRACT_VERSION,
} from '../scoring/scoring-constants.ts';
import { ASSET_REQUIREMENT_LIMITS } from '../contracts/asset-requirement-set.ts';
import { DEFAULT_RESOLUTION_POLICY } from '../contracts/resolution-policy.ts';
import { stableStringify } from '../schema/requirement-serialization.ts';

export function computeAssetResolverRevision(): string {
  const payload = {
    requirementSchema: ASSET_REQUIREMENT_SCHEMA_VERSION,
    planSchema: ASSET_PLAN_SCHEMA_VERSION,
    normalization: NORMALIZATION_CONTRACT_VERSION,
    scoring: SCORING_CONTRACT_VERSION,
    weights: ASSET_RESOLVER_SCORE_WEIGHTS,
    confidence: { high: CONFIDENCE_HIGH, medium: CONFIDENCE_MEDIUM },
    strategy: STRATEGY_CONTRACT_VERSION,
    planning: PLANNING_CONTRACT_VERSION,
    composition: {
      version: COMPOSITION_CONTRACT_VERSION,
      switchMargin: COMPOSITION_SWITCH_MARGIN,
      complexityPenalty: COMPOSITION_PART_COMPLEXITY_PENALTY,
    },
    duplicate: DUPLICATE_CONTRACT_VERSION,
    tiebreak: TIEBREAK_CONTRACT_VERSION,
    limits: ASSET_REQUIREMENT_LIMITS,
    defaults: DEFAULT_RESOLUTION_POLICY,
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 16);
}
