export const BETTER_CHAT_CUT_SCENE_TEMPLATE_ID = 'better-chat-cut.scene-v1';

export const BETTER_CHAT_CUT_SCENE_PROPS_KEY = '__betterChatCutScene';

/** Sibling metadata for bind idempotency; not part of binding payload hash. */
export const BETTER_CHAT_CUT_SCENE_REQUEST_META_KEY = '__betterChatCutSceneRequest';

export const SCENE_CLIP_BINDING_SCHEMA_VERSION = '1.0.0';

export const SCENE_CLIP_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export type SceneClipRequestMetaV1 = {
  createRequestId: string;
  createInputHash: string;
};
