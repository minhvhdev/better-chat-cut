import type { SceneDraftStore } from '../../../scene-drafts/src/runtime/scene-draft-service.ts';
import { SceneClipError } from '../contracts/scene-clip-errors.ts';
import {
  buildSceneClipBindingFromScene,
  type SceneDraftBindingPayloadResult,
  type SceneDraftBindingService,
} from './scene-draft-binding-service.ts';

export function createSceneDraftBindingService(store: SceneDraftStore): SceneDraftBindingService {
  return {
    async createBindingPayload(input): Promise<SceneDraftBindingPayloadResult> {
      try {
        const snapshot = await store.createBindingPayload(input);
        // When binding a non-current history entry, draftRevision still records the
        // draft tip revision at generation time (authoring pointer), while
        // historyEntryId + sceneContentHash pin the exact snapshot.
        return buildSceneClipBindingFromScene({
          draftId: snapshot.draftId,
          draftRevision: snapshot.draftRevision,
          historyEntryId: snapshot.historyEntryId,
          sceneContentHash: snapshot.sceneContentHash,
          scene: snapshot.scene,
          sourceAssetPlan: snapshot.sourceAssetPlan,
        });
      } catch (error) {
        if (error instanceof SceneClipError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('not found') || message.includes('NOT_FOUND')) {
          throw new SceneClipError('SCENE_BINDING_DRAFT_NOT_FOUND', message, {
            recovery: 'Call scene_draft_list / scene_draft_create first',
          });
        }
        if (message.includes('History entry') || message.includes('HISTORY_ENTRY')) {
          throw new SceneClipError('SCENE_BINDING_HISTORY_ENTRY_NOT_FOUND', message, {
            recovery: 'Pass a valid historyEntryId from scene_draft_get',
          });
        }
        throw error;
      }
    },
  };
}

export * from './scene-draft-binding-service.ts';
