/** Strategy helpers live in planning/batch-planner for M3B; this module documents the public strategy set. */
export const ASSET_RESOLUTION_STRATEGIES = [
  'exact',
  'reuse',
  'variant',
  'composition',
  'review-duplicate',
  'create-new',
  'none',
] as const;
