export const ASSET_RESOLVER_SCORE_WEIGHTS = {
  text: 0.30,
  capability: 0.20,
  kind: 0.10,
  category: 0.08,
  tag: 0.08,
  style: 0.07,
  props: 0.07,
  preferredAsset: 0.04,
  status: 0.03,
  reuse: 0.03,
} as const;

export const COMPOSITION_SWITCH_MARGIN = 0.05;
export const COMPOSITION_PART_COMPLEXITY_PENALTY = 0.02;
export const REQUIRED_PART_WEIGHT = 2;
export const OPTIONAL_PART_WEIGHT = 1;

export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MEDIUM = 0.70;

export const NORMALIZATION_CONTRACT_VERSION = '1.0.0';
export const SCORING_CONTRACT_VERSION = '1.0.0';
export const STRATEGY_CONTRACT_VERSION = '1.0.0';
export const PLANNING_CONTRACT_VERSION = '1.0.0';
export const COMPOSITION_CONTRACT_VERSION = '1.0.0';
export const DUPLICATE_CONTRACT_VERSION = '1.0.0';
export const TIEBREAK_CONTRACT_VERSION = '1.0.0';
