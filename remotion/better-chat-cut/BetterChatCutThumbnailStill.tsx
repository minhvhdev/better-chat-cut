import {
  BetterChatCutSceneStill,
  type BetterChatCutSceneStillProps,
} from './BetterChatCutSceneStill.tsx';

/**
 * Thin alias composition for publishing thumbnails.
 * Reuses SceneRuntimeRenderer path via BetterChatCutSceneStill (no second renderer).
 */
export type BetterChatCutThumbnailStillProps = BetterChatCutSceneStillProps;

export function BetterChatCutThumbnailStill(props: BetterChatCutThumbnailStillProps) {
  return <BetterChatCutSceneStill {...props} />;
}
