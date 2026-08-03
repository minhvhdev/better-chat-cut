import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import { SceneClipError } from '../contracts/scene-clip-errors.ts';
import { parseSceneClipBinding } from '../schema/scene-clip-props-validator.ts';
import { validateBetterChatCutSceneClipReadiness } from './scene-clip-readiness.ts';

export async function assertSceneClipExportReady(item: SceneClipTimelineItemLike): Promise<void> {
  const readiness = await validateBetterChatCutSceneClipReadiness(item);
  if (readiness.ready) return;
  const first = readiness.errors[0];
  throw new SceneClipError(
    first?.code ?? 'SCENE_CLIP_EXPORT_NOT_READY',
    first?.message ?? 'Scene clip is not ready for export',
    {
      diagnostics: readiness.errors,
      details: { itemId: item.id, sceneId: parseSceneClipBinding(item).binding?.scene.id },
      recovery: first?.recovery ?? 'Fix binding/dependencies then retry export',
    },
  );
}

export function validateSceneClipRenderBinding(item: SceneClipTimelineItemLike) {
  return parseSceneClipBinding(item);
}
