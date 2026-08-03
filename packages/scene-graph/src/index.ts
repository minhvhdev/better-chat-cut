export type {
  SceneDocumentV1,
} from './contracts/scene-document.ts';
export {
  SCENE_SCHEMA_VERSION,
  SCENE_LIMITS,
  SCENE_ID_PATTERN,
  NODE_ID_PATTERN,
  SCENE_RUNTIME_CONTRACT_VERSION,
  SCENE_PREVIEW_RENDERER_VERSION,
} from './contracts/scene-document.ts';
export type { SceneNodeV1, SceneGroupNodeV1, SceneAssetNodeV1 } from './contracts/scene-node.ts';
export type { SceneAnimationInstanceV1 } from './contracts/scene-animation.ts';
export type { SceneDiagnostic, SceneErrorShape } from './contracts/scene-errors.ts';
export type { SceneDependencyResolution } from './contracts/scene-dependency.ts';
export type { SceneFrameEvaluation, EvaluatedSceneNode } from './contracts/scene-evaluation.ts';
export type {
  ScenePreviewMetadata,
  SceneStillResult,
  SceneContactSheetResult,
  SceneLayoutAnalysis,
} from './contracts/scene-preview.ts';

export {
  normalizeSceneDocument,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  createSceneValidator,
  stableStringify,
  getSceneRuntimeCapabilities,
} from './schema/index.ts';

export {
  buildSceneGraph,
  traverseSceneGraph,
  sortNodesDeterministic,
  validateSceneGraphStructure,
} from './graph/index.ts';

export {
  identityMatrix,
  multiplyMatrices,
  translationMatrix,
  rotationMatrix,
  scaleMatrix,
  buildNodeLocalMatrix,
  worldAabb,
  MATRIX_EPSILON,
} from './geometry/index.ts';

export { createSceneDependencyResolver, resolveThemeRegistryId } from './dependencies/index.ts';

export {
  createSceneRuntime,
  createSceneFrameEvaluator,
  evaluateSceneNodeAtFrame,
} from './runtime/index.ts';

// React renderers: import from runtime/*.tsx or remotion/better-chat-cut/* directly.

export { createSceneLayoutAnalyzer, analyzeSceneLayout } from './analysis/index.ts';

export {
  createScenePreviewService,
  ScenePreviewError,
  defaultContactSheetFrames,
  buildScenePreviewCacheKey,
} from './preview/index.ts';

export {
  BASIC_EXPLAINER_SCENE,
  GROUP_TRANSFORM_SCENE,
  NESTED_GROUP_SCENE,
} from './fixtures/valid/index.ts';
