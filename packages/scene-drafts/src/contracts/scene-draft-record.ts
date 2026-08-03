import type { SceneDraftAssetPlanReferenceV1 } from './asset-plan-binding.ts';
import { SCENE_DRAFT_SCHEMA_VERSION } from './scene-draft.ts';

export type SceneDraftRecordV1 = {
  schemaVersion: typeof SCENE_DRAFT_SCHEMA_VERSION;
  draftId: string;
  name: string;
  description?: string;
  revision: number;
  currentHistoryEntryId: string;
  historyEntryIds: string[];
  historyCursor: number;
  sceneId: string;
  sceneContentHash: string;
  sourceAssetPlan?: SceneDraftAssetPlanReferenceV1;
  createdAt: string;
  updatedAt: string;
};
