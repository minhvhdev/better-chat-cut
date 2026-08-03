import type { SceneDraftOperationType } from './scene-draft-operation.ts';
import { SCENE_DRAFT_SCHEMA_VERSION } from './scene-draft.ts';

export type SceneDraftOperationReceiptV1 = {
  schemaVersion: typeof SCENE_DRAFT_SCHEMA_VERSION;
  requestId: string;
  inputHash: string;
  operation: SceneDraftOperationType;
  draftId: string;
  previousRevision?: number;
  resultingRevision: number;
  previousSceneContentHash?: string;
  resultingSceneContentHash: string;
  historyEntryId: string;
  completedAt: string;
};
