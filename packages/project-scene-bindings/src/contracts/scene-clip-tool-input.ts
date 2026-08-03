import type { SceneClipBindingV1 } from './scene-clip-binding.ts';

export type CreateSceneDraftBindingPayloadInput = {
  draftId: string;
  historyEntryId?: string;
};

export type BindSceneClipInput = {
  requestId: string;
  binding: SceneClipBindingV1;
  track?: string;
  startFrame?: number;
  ripple?: boolean;
  name?: string;
};

export type SyncSceneClipInput = {
  requestId: string;
  itemId: string;
  expectedItemFingerprint: string;
  expectedBindingPayloadHash: string;
  binding: SceneClipBindingV1;
  timingPolicy?: 'preserve-timeline' | 'match-scene';
  namePolicy?: 'preserve' | 'match-draft';
};

export type BuildSceneTimelineItemInput = {
  itemId: string;
  trackId: string;
  startFrame: number;
  projectFps: number;
  binding: SceneClipBindingV1;
  name?: string;
};
