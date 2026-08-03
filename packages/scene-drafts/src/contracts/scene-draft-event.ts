import { SCENE_DRAFT_SCHEMA_VERSION } from './scene-draft.ts';

export type SceneDraftEventType =
  | 'scene-draft.created'
  | 'scene-draft.composed'
  | 'scene-draft.patched'
  | 'scene-draft.undone'
  | 'scene-draft.redone';

export type SceneDraftEventV1 = {
  schemaVersion: typeof SCENE_DRAFT_SCHEMA_VERSION;
  eventId: string;
  requestId: string;
  eventType: SceneDraftEventType;
  draftId: string;
  previousRevision?: number;
  nextRevision: number;
  previousSceneContentHash?: string;
  nextSceneContentHash: string;
  patchHash?: string;
  occurredAt: string;
};
