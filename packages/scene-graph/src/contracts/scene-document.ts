/** Scene Graph Schema v1 — pure data contracts (no React / executable content). */

import type { SceneNodeV1 } from './scene-node.ts';

export const SCENE_SCHEMA_VERSION = '1.0.0' as const;
export const SCENE_RENDERER_CONTRACT_VERSION = '1.0.0' as const;
export const SCENE_TRANSFORM_SEMANTICS_VERSION = '1.0.0' as const;
export const SCENE_ANIMATION_COMPOSITION_VERSION = '1.0.0' as const;
export const SCENE_LAYOUT_FIT_SEMANTICS_VERSION = '1.0.0' as const;
export const SCENE_RUNTIME_CONTRACT_VERSION = '1.0.0' as const;
export const SCENE_PREVIEW_RENDERER_VERSION = '1.0.0' as const;

export const SCENE_LIMITS = {
  MAX_SERIALIZED_BYTES: 1 * 1024 * 1024,
  MAX_NODES: 200,
  MAX_GRAPH_DEPTH: 8,
  MAX_ANIMATIONS_PER_NODE: 16,
  MAX_PROPS_SERIALIZED_BYTES: 64 * 1024,
  MIN_CANVAS_WIDTH: 320,
  MAX_CANVAS_WIDTH: 3840,
  MIN_CANVAS_HEIGHT: 180,
  MAX_CANVAS_HEIGHT: 2160,
  MIN_FPS: 1,
  MAX_FPS: 60,
  MIN_DURATION_FRAMES: 1,
  MAX_DURATION_FRAMES: 1800,
  MIN_OUTPUT_WIDTH: 320,
  MAX_OUTPUT_WIDTH: 1920,
  MIN_OUTPUT_HEIGHT: 180,
  MAX_OUTPUT_HEIGHT: 1080,
} as const;

export const SCENE_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export type SceneDocumentV1 = {
  schemaVersion: typeof SCENE_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
  };
  fps: number;
  durationInFrames: number;
  theme: {
    id: string;
    version: string;
  };
  safeArea?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  nodes: SceneNodeV1[];
};

export type { SceneNodeV1, SceneGroupNodeV1, SceneAssetNodeV1, SceneNodeBaseV1 } from './scene-node.ts';
export type { SceneAnimationInstanceV1 } from './scene-animation.ts';
export type { SceneTransformV1 } from './scene-transform.ts';
