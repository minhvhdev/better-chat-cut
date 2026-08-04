export { stableStringify, sha256Hex, deepCloneJson, asRecord } from './serialization.ts';
export { DISTRIBUTION_REVISION } from './distribution-revision.ts';
export {
  computeDesktopDistributionPlanHash,
  computeDesktopBuildProvenanceHash,
  computeDesktopDistributionManifestHash,
} from './distribution-hash.ts';
export {
  type ValidationResult,
  normalizeDistributionTarget,
  validateUpdatePolicy,
  validateSigningPolicy,
  validateDesktopDistributionPlan,
  allowedFormatsForPlatform,
} from './distribution-validator.ts';
