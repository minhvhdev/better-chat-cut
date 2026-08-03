import type { SceneDocumentV1 } from '../../../scene-graph/src/contracts/scene-document.ts';
import type { SceneDraftAssetPlanReferenceV1 } from '../../../scene-drafts/src/contracts/asset-plan-binding.ts';

export type SceneClipBindingAssetDependencyV1 = {
  id: string;
  version: string;
  contentHash: string;
  implementationFingerprint?: string;
  status: 'staging' | 'published' | 'deprecated';
};

export type SceneClipBindingAnimationDependencyV1 = {
  id: string;
  version: string;
};

export type SceneClipBindingThemeDependencyV1 = {
  id: string;
  version: string;
};

export type SceneClipBindingSourceDraftV1 = {
  draftId: string;
  draftRevision: number;
  historyEntryId: string;
  sceneContentHash: string;
};

export type SceneClipBindingDependenciesV1 = {
  assets: SceneClipBindingAssetDependencyV1[];
  animations: SceneClipBindingAnimationDependencyV1[];
  theme: SceneClipBindingThemeDependencyV1;
};

export type SceneClipBindingV1 = {
  schemaVersion: '1.0.0';
  bindingMode: 'embedded-snapshot';
  sourceDraft: SceneClipBindingSourceDraftV1;
  scene: SceneDocumentV1;
  sceneContentHash: string;
  dependencyFingerprint: string;
  catalogRevision: string;
  motionRuntimeRevision: string;
  sceneRuntimeRevision: string;
  dependencies: SceneClipBindingDependenciesV1;
  sourceAssetPlan?: SceneDraftAssetPlanReferenceV1;
  bindingPayloadHash: string;
};

export type SceneClipBindingWithoutHash = Omit<SceneClipBindingV1, 'bindingPayloadHash'>;

export type BetterChatCutSceneClipProps = {
  __betterChatCutScene: SceneClipBindingV1;
};
