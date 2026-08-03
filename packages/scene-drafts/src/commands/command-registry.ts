import type { SceneDocumentV1, SceneNodeV1 } from '../../../scene-graph/src/index.ts';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';
import type {
  NodeAddAssetOp,
  NodeAddGroupOp,
  NodeAnimationAddOp,
  NodeAnimationRemoveOp,
  NodeAnimationUpdateOp,
  NodeRemoveOp,
  NodeReplaceAssetOp,
  NodeReparentOp,
  NodeSetEnabledOp,
  NodeSetFitOp,
  NodeSetMetadataOp,
  NodeSetOrderOp,
  NodeSetPropsOp,
  NodeUpdateLayoutOp,
  NodeUpdateTimingOp,
  NodeUpdateTransformOp,
  ScenePatchOperationV1,
  SceneSetCanvasOp,
  SceneSetMetadataOp,
  SceneSetSafeAreaOp,
  SceneSetThemeOp,
  SceneSetTimingOp,
} from '../contracts/scene-patch.ts';
import type { SceneCommandContext, SceneCommandHandler } from './scene-command-context.ts';
import { findNode, replaceNodes } from './scene-command-context.ts';

function requireNode(scene: SceneDocumentV1, nodeId: string, operationId: string): SceneNodeV1 {
  const node = findNode(scene, nodeId);
  if (!node) {
    throw new SceneDraftError('SCENE_PATCH_NODE_NOT_FOUND', `Node ${nodeId} not found`, {
      details: { operationId, nodeId },
      recovery: 'Pass an existing nodeId',
    });
  }
  return node;
}

function mapNode(scene: SceneDocumentV1, nodeId: string, map: (n: SceneNodeV1) => SceneNodeV1): SceneDocumentV1 {
  return replaceNodes(scene, scene.nodes.map((n) => (n.id === nodeId ? map(n) : n)));
}

function wouldCreateCycle(scene: SceneDocumentV1, nodeId: string, newParentId?: string): boolean {
  if (!newParentId) return false;
  if (newParentId === nodeId) return true;
  let cursor: string | undefined = newParentId;
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === nodeId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId;
  }
  return false;
}

function collectSubtreeIds(scene: SceneDocumentV1, rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const node of scene.nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return out;
}

export const sceneSettingsCommands: Record<string, SceneCommandHandler> = {
  'scene.set_metadata'(ctx, op) {
    const o = op as SceneSetMetadataOp;
    const scene = { ...ctx.scene };
    if (o.name !== undefined) scene.name = o.name;
    if (o.description === null) delete scene.description;
    else if (o.description !== undefined) scene.description = o.description;
    return { ...ctx, scene };
  },
  'scene.set_canvas'(ctx, op) {
    const o = op as SceneSetCanvasOp;
    return { ...ctx, scene: { ...ctx.scene, canvas: { ...o.canvas } } };
  },
  'scene.set_timing'(ctx, op) {
    const o = op as SceneSetTimingOp;
    const scene = { ...ctx.scene };
    if (o.fps !== undefined) scene.fps = o.fps;
    if (o.durationInFrames !== undefined) scene.durationInFrames = o.durationInFrames;
    return { ...ctx, scene };
  },
  'scene.set_theme'(ctx, op) {
    const o = op as SceneSetThemeOp;
    return { ...ctx, scene: { ...ctx.scene, theme: { ...o.theme } } };
  },
  'scene.set_safe_area'(ctx, op) {
    const o = op as SceneSetSafeAreaOp;
    const scene = { ...ctx.scene };
    if (o.safeArea === null) delete scene.safeArea;
    else scene.safeArea = { ...o.safeArea };
    return { ...ctx, scene };
  },
};

export const nodeCreationCommands: Record<string, SceneCommandHandler> = {
  'node.add_group'(ctx, op) {
    const o = op as NodeAddGroupOp;
    if (findNode(ctx.scene, o.node.id)) {
      throw new SceneDraftError('SCENE_PATCH_NODE_ALREADY_EXISTS', `Node ${o.node.id} already exists`, {
        details: { operationId: o.operationId, nodeId: o.node.id },
      });
    }
    if (o.node.parentId) {
      const parent = requireNode(ctx.scene, o.node.parentId, o.operationId);
      if (parent.type !== 'group') {
        throw new SceneDraftError('SCENE_PATCH_PARENT_NOT_GROUP', 'Parent must be a group', {
          details: { operationId: o.operationId, nodeId: o.node.parentId },
        });
      }
    }
    return { ...ctx, scene: replaceNodes(ctx.scene, [...ctx.scene.nodes, { ...o.node, type: 'group' }]) };
  },
  'node.add_asset'(ctx, op) {
    const o = op as NodeAddAssetOp;
    if (findNode(ctx.scene, o.node.id)) {
      throw new SceneDraftError('SCENE_PATCH_NODE_ALREADY_EXISTS', `Node ${o.node.id} already exists`, {
        details: { operationId: o.operationId, nodeId: o.node.id },
      });
    }
    if (o.node.parentId) {
      const parent = requireNode(ctx.scene, o.node.parentId, o.operationId);
      if (parent.type !== 'group') {
        throw new SceneDraftError('SCENE_PATCH_PARENT_NOT_GROUP', 'Parent must be a group', {
          details: { operationId: o.operationId, nodeId: o.node.parentId },
        });
      }
    }
    return { ...ctx, scene: replaceNodes(ctx.scene, [...ctx.scene.nodes, { ...o.node, type: 'asset' }]) };
  },
  'node.remove'(ctx, op) {
    const o = op as NodeRemoveOp;
    requireNode(ctx.scene, o.nodeId, o.operationId);
    const cascade = o.cascade === true;
    const children = ctx.scene.nodes.filter((n) => n.parentId === o.nodeId);
    if (children.length && !cascade) {
      throw new SceneDraftError('SCENE_PATCH_NODE_HAS_CHILDREN', `Node ${o.nodeId} has children`, {
        details: { operationId: o.operationId, nodeId: o.nodeId },
        recovery: 'Set cascade=true to remove the subtree',
      });
    }
    const removeIds = new Set(cascade ? collectSubtreeIds(ctx.scene, o.nodeId) : [o.nodeId]);
    return {
      ...ctx,
      scene: replaceNodes(ctx.scene, ctx.scene.nodes.filter((n) => !removeIds.has(n.id))),
    };
  },
};

export const nodeLayoutCommands: Record<string, SceneCommandHandler> = {
  'node.update_layout'(ctx, op) {
    const o = op as NodeUpdateLayoutOp;
    requireNode(ctx.scene, o.nodeId, o.operationId);
    return { ...ctx, scene: mapNode(ctx.scene, o.nodeId, (n) => ({ ...n, layout: { ...o.layout } })) };
  },
  'node.update_transform'(ctx, op) {
    const o = op as NodeUpdateTransformOp;
    requireNode(ctx.scene, o.nodeId, o.operationId);
    return { ...ctx, scene: mapNode(ctx.scene, o.nodeId, (n) => ({ ...n, transform: { ...o.transform } })) };
  },
  'node.update_timing'(ctx, op) {
    const o = op as NodeUpdateTimingOp;
    requireNode(ctx.scene, o.nodeId, o.operationId);
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => ({ ...n, startFrame: o.startFrame, endFrame: o.endFrame })),
    };
  },
  'node.set_enabled'(ctx, op) {
    const o = op as NodeSetEnabledOp;
    requireNode(ctx.scene, o.nodeId, o.operationId);
    return { ...ctx, scene: mapNode(ctx.scene, o.nodeId, (n) => ({ ...n, enabled: o.enabled })) };
  },
  'node.set_metadata'(ctx, op) {
    const o = op as NodeSetMetadataOp;
    requireNode(ctx.scene, o.nodeId, o.operationId);
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => {
        const next = { ...n };
        if (o.metadata === null) delete next.metadata;
        else next.metadata = { ...o.metadata };
        return next;
      }),
    };
  },
};

export const nodeHierarchyCommands: Record<string, SceneCommandHandler> = {
  'node.reparent'(ctx, op) {
    const o = op as NodeReparentOp;
    requireNode(ctx.scene, o.nodeId, o.operationId);
    if (o.parentId !== undefined) {
      const parent = requireNode(ctx.scene, o.parentId, o.operationId);
      if (parent.type !== 'group') {
        throw new SceneDraftError('SCENE_PATCH_PARENT_NOT_GROUP', 'Parent must be a group', {
          details: { operationId: o.operationId, nodeId: o.parentId },
        });
      }
    }
    if (wouldCreateCycle(ctx.scene, o.nodeId, o.parentId)) {
      throw new SceneDraftError('SCENE_PATCH_GRAPH_CYCLE', 'Reparent would create a cycle', {
        details: { operationId: o.operationId, nodeId: o.nodeId },
        recovery: 'Choose a non-descendant parent',
      });
    }
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => {
        const next = { ...n };
        if (o.parentId === undefined) delete next.parentId;
        else next.parentId = o.parentId;
        return next;
      }),
    };
  },
  'node.set_order'(ctx, op) {
    const o = op as NodeSetOrderOp;
    requireNode(ctx.scene, o.nodeId, o.operationId);
    return { ...ctx, scene: mapNode(ctx.scene, o.nodeId, (n) => ({ ...n, order: o.order })) };
  },
};

export const nodeAssetCommands: Record<string, SceneCommandHandler> = {
  'node.replace_asset'(ctx, op) {
    const o = op as NodeReplaceAssetOp;
    const node = requireNode(ctx.scene, o.nodeId, o.operationId);
    if (node.type !== 'asset') {
      throw new SceneDraftError('SCENE_PATCH_INVALID_ASSET', 'replace_asset requires an asset node', {
        details: { operationId: o.operationId, nodeId: o.nodeId },
      });
    }
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => {
        if (n.type !== 'asset') return n;
        return {
          ...n,
          asset: {
            id: o.asset.id,
            version: o.asset.version,
            props: o.asset.props ?? n.asset.props,
          },
          fit: o.fit ?? n.fit,
        };
      }),
    };
  },
  'node.set_props'(ctx, op) {
    const o = op as NodeSetPropsOp;
    const node = requireNode(ctx.scene, o.nodeId, o.operationId);
    if (node.type !== 'asset') {
      throw new SceneDraftError('SCENE_PATCH_INVALID_PROPS', 'set_props requires an asset node', {
        details: { operationId: o.operationId, nodeId: o.nodeId },
      });
    }
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => {
        if (n.type !== 'asset') return n;
        return { ...n, asset: { ...n.asset, props: { ...o.props } } };
      }),
    };
  },
  'node.set_fit'(ctx, op) {
    const o = op as NodeSetFitOp;
    const node = requireNode(ctx.scene, o.nodeId, o.operationId);
    if (node.type !== 'asset') {
      throw new SceneDraftError('SCENE_PATCH_INVALID_ASSET', 'set_fit requires an asset node', {
        details: { operationId: o.operationId, nodeId: o.nodeId },
      });
    }
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => (n.type === 'asset' ? { ...n, fit: o.fit } : n)),
    };
  },
};

export const nodeAnimationCommands: Record<string, SceneCommandHandler> = {
  'node.animation_add'(ctx, op) {
    const o = op as NodeAnimationAddOp;
    const node = requireNode(ctx.scene, o.nodeId, o.operationId);
    const existing = node.animations ?? [];
    if (existing.some((a) => a.id === o.animation.id)) {
      throw new SceneDraftError('SCENE_PATCH_INVALID_ANIMATION', `Animation instance ${o.animation.id} already exists`, {
        details: { operationId: o.operationId, nodeId: o.nodeId },
      });
    }
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => ({
        ...n,
        animations: [...(n.animations ?? []), { ...o.animation }],
      })),
    };
  },
  'node.animation_update'(ctx, op) {
    const o = op as NodeAnimationUpdateOp;
    const node = requireNode(ctx.scene, o.nodeId, o.operationId);
    const existing = node.animations ?? [];
    if (!existing.some((a) => a.id === o.animation.id)) {
      throw new SceneDraftError('SCENE_PATCH_INVALID_ANIMATION', `Animation instance ${o.animation.id} not found`, {
        details: { operationId: o.operationId, nodeId: o.nodeId },
      });
    }
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => ({
        ...n,
        animations: (n.animations ?? []).map((a) => (a.id === o.animation.id ? { ...o.animation } : a)),
      })),
    };
  },
  'node.animation_remove'(ctx, op) {
    const o = op as NodeAnimationRemoveOp;
    const node = requireNode(ctx.scene, o.nodeId, o.operationId);
    const existing = node.animations ?? [];
    if (!existing.some((a) => a.id === o.animationInstanceId)) {
      throw new SceneDraftError('SCENE_PATCH_INVALID_ANIMATION', `Animation instance ${o.animationInstanceId} not found`, {
        details: { operationId: o.operationId, nodeId: o.nodeId },
      });
    }
    return {
      ...ctx,
      scene: mapNode(ctx.scene, o.nodeId, (n) => ({
        ...n,
        animations: (n.animations ?? []).filter((a) => a.id !== o.animationInstanceId),
      })),
    };
  },
};

export function getCommandRegistry(): Record<string, SceneCommandHandler> {
  return {
    ...sceneSettingsCommands,
    ...nodeCreationCommands,
    ...nodeLayoutCommands,
    ...nodeHierarchyCommands,
    ...nodeAssetCommands,
    ...nodeAnimationCommands,
  };
}

export function applyOperation(ctx: SceneCommandContext, op: ScenePatchOperationV1): SceneCommandContext {
  const handler = getCommandRegistry()[op.type];
  if (!handler) {
    throw new SceneDraftError('SCENE_PATCH_OPERATION_UNSUPPORTED', `Unsupported operation ${op.type}`, {
      details: { operationId: op.operationId },
    });
  }
  return handler(ctx, op);
}
