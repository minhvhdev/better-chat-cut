export {
  MOTION_COMPILER_VERSION,
  MOTION_RUNTIME_CONTRACT_VERSION,
  MOTION_SANDBOX_CONTRACT_VERSION,
  MOTION_SDK_VERSION,
  MOTION_SOURCE_PIPELINE_VERSION,
  MAX_BUNDLE_BYTES,
  MAX_SOURCE_BYTES,
  ALLOWED_IMPORTS,
  ALLOWED_SDK_EXPORTS,
} from './constants.ts';

export { MotionSourceError } from './errors.ts';
export {
  computeBuildHash,
  computeMotionImplementationFingerprint,
  computeSourceHash,
} from './hashes.ts';
export { validateMotionSource } from './validator/validate-source.ts';
export { compileMotionSourceToBundle } from './compiler/compile-source.ts';
export { getMotionSourceContract, SOURCE_TEMPLATE } from './contracts/source-contract.ts';
export type {
  MotionSourceBuildResult,
  MotionSourceValidationIssue,
  MotionSourceValidationResult,
  UserMotionRuntimeDescriptor,
} from './contracts/types.ts';

export { createMotionAssetSourceService } from './services/source-service.ts';
export { createMotionSourceCompiler } from './services/build-service.ts';
export { createMotionCandidatePreviewService } from './services/candidate-preview.ts';
export { createMotionAssetStagingPreparationService } from './services/prepare-staging.ts';
export {
  refreshVerifiedUserMotionRuntimes,
  inspectCandidateAvailability,
} from './runtime/user-runtime-registry.ts';
export { resolveMotionAssetPaths } from './paths/asset-paths.ts';
