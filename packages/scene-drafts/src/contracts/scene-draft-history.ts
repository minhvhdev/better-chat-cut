import type { SceneDocumentV1 } from '../../../scene-graph/src/index.ts';
import type { SceneDraftAssetPlanReferenceV1 } from './asset-plan-binding.ts';
import { SCENE_DRAFT_SCHEMA_VERSION } from './scene-draft.ts';

export type SceneDraftHistoryEntryV1 = {
  schemaVersion: typeof SCENE_DRAFT_SCHEMA_VERSION;
  entryId: string;
  scene: SceneDocumentV1;
  sceneContentHash: string;
  operation: {
    type: 'create' | 'compose-asset-plan' | 'patch';
    requestId: string;
    patchHash?: string;
  };
  sourceAssetPlan?: SceneDraftAssetPlanReferenceV1;
  createdAt: string;
};
