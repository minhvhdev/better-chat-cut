import type {
  SceneAnimationInstanceV1,
  SceneAssetNodeV1,
  SceneGroupNodeV1,
} from '../../../scene-graph/src/index.ts';
import type { SceneTransformV1 } from '../../../scene-graph/src/contracts/scene-transform.ts';

export type { SceneTransformV1 };

export const SCENE_PATCH_SCHEMA_VERSION = '1.0.0' as const;
export const MAX_PATCH_OPERATIONS = 100;
export const MAX_PATCH_SERIALIZED_SIZE = 512 * 1024;

export type ScenePatchOperationBaseV1 = {
  operationId: string;
};

export type SceneSetMetadataOp = ScenePatchOperationBaseV1 & {
  type: 'scene.set_metadata';
  name?: string;
  description?: string | null;
};

export type SceneSetCanvasOp = ScenePatchOperationBaseV1 & {
  type: 'scene.set_canvas';
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
  };
};

export type SceneSetTimingOp = ScenePatchOperationBaseV1 & {
  type: 'scene.set_timing';
  fps?: number;
  durationInFrames?: number;
};

export type SceneSetThemeOp = ScenePatchOperationBaseV1 & {
  type: 'scene.set_theme';
  theme: { id: string; version: string };
};

export type SceneSetSafeAreaOp = ScenePatchOperationBaseV1 & {
  type: 'scene.set_safe_area';
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null;
};

export type NodeAddGroupOp = ScenePatchOperationBaseV1 & {
  type: 'node.add_group';
  node: SceneGroupNodeV1;
};

export type NodeAddAssetOp = ScenePatchOperationBaseV1 & {
  type: 'node.add_asset';
  node: SceneAssetNodeV1;
};

export type NodeRemoveOp = ScenePatchOperationBaseV1 & {
  type: 'node.remove';
  nodeId: string;
  cascade?: boolean;
};

export type NodeUpdateLayoutOp = ScenePatchOperationBaseV1 & {
  type: 'node.update_layout';
  nodeId: string;
  layout: { x: number; y: number; width: number; height: number };
};

export type NodeUpdateTransformOp = ScenePatchOperationBaseV1 & {
  type: 'node.update_transform';
  nodeId: string;
  transform: SceneTransformV1;
};

export type NodeUpdateTimingOp = ScenePatchOperationBaseV1 & {
  type: 'node.update_timing';
  nodeId: string;
  startFrame: number;
  endFrame: number;
};

export type NodeSetEnabledOp = ScenePatchOperationBaseV1 & {
  type: 'node.set_enabled';
  nodeId: string;
  enabled: boolean;
};

export type NodeSetMetadataOp = ScenePatchOperationBaseV1 & {
  type: 'node.set_metadata';
  nodeId: string;
  metadata: { role?: string; label?: string } | null;
};

export type NodeReparentOp = ScenePatchOperationBaseV1 & {
  type: 'node.reparent';
  nodeId: string;
  parentId?: string;
};

export type NodeSetOrderOp = ScenePatchOperationBaseV1 & {
  type: 'node.set_order';
  nodeId: string;
  order: number;
};

export type NodeReplaceAssetOp = ScenePatchOperationBaseV1 & {
  type: 'node.replace_asset';
  nodeId: string;
  asset: { id: string; version: string; props?: Record<string, unknown> };
  fit?: 'contain' | 'cover' | 'stretch';
};

export type NodeSetPropsOp = ScenePatchOperationBaseV1 & {
  type: 'node.set_props';
  nodeId: string;
  props: Record<string, unknown>;
};

export type NodeSetFitOp = ScenePatchOperationBaseV1 & {
  type: 'node.set_fit';
  nodeId: string;
  fit: 'contain' | 'cover' | 'stretch';
};

export type NodeAnimationAddOp = ScenePatchOperationBaseV1 & {
  type: 'node.animation_add';
  nodeId: string;
  animation: SceneAnimationInstanceV1;
};

export type NodeAnimationUpdateOp = ScenePatchOperationBaseV1 & {
  type: 'node.animation_update';
  nodeId: string;
  animation: SceneAnimationInstanceV1;
};

export type NodeAnimationRemoveOp = ScenePatchOperationBaseV1 & {
  type: 'node.animation_remove';
  nodeId: string;
  animationInstanceId: string;
};

export type ScenePatchOperationV1 =
  | SceneSetMetadataOp
  | SceneSetCanvasOp
  | SceneSetTimingOp
  | SceneSetThemeOp
  | SceneSetSafeAreaOp
  | NodeAddGroupOp
  | NodeAddAssetOp
  | NodeRemoveOp
  | NodeUpdateLayoutOp
  | NodeUpdateTransformOp
  | NodeUpdateTimingOp
  | NodeSetEnabledOp
  | NodeSetMetadataOp
  | NodeReparentOp
  | NodeSetOrderOp
  | NodeReplaceAssetOp
  | NodeSetPropsOp
  | NodeSetFitOp
  | NodeAnimationAddOp
  | NodeAnimationUpdateOp
  | NodeAnimationRemoveOp;

export type ScenePatchV1 = {
  schemaVersion: typeof SCENE_PATCH_SCHEMA_VERSION;
  id: string;
  description?: string;
  operations: ScenePatchOperationV1[];
};

export const SUPPORTED_PATCH_OPERATION_TYPES = [
  'scene.set_metadata',
  'scene.set_canvas',
  'scene.set_timing',
  'scene.set_theme',
  'scene.set_safe_area',
  'node.add_group',
  'node.add_asset',
  'node.remove',
  'node.update_layout',
  'node.update_transform',
  'node.update_timing',
  'node.set_enabled',
  'node.set_metadata',
  'node.reparent',
  'node.set_order',
  'node.replace_asset',
  'node.set_props',
  'node.set_fit',
  'node.animation_add',
  'node.animation_update',
  'node.animation_remove',
] as const;
