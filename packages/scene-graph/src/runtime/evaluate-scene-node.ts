import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneNodeV1 } from '../contracts/scene-node.ts';
import type { EvaluatedSceneNode } from '../contracts/scene-evaluation.ts';
import { DEFAULT_SCENE_TRANSFORM } from '../contracts/scene-transform.ts';
import {
  buildNodeLocalMatrix,
  composeWorldMatrix,
  identityMatrix,
  worldAabb,
  type Rectangle,
} from '../geometry/index.ts';
import {
  composeMotionAnimationTransforms,
  type AnimationApplyRequest,
} from '../../../motion-components/src/index.ts';

function nodeActiveAtFrame(node: SceneNodeV1, frame: number, ancestorActive: boolean): boolean {
  const enabled = node.enabled !== false;
  const inRange = frame >= node.startFrame && frame < node.endFrame;
  return enabled && inRange && ancestorActive;
}

/** Pure frame/node evaluation — safe for Remotion client bundles (no Node deps). */
export function evaluateSceneNodeAtFrame(args: {
  scene: SceneDocumentV1;
  node: SceneNodeV1;
  frame: number;
  parentWorldMatrix: ReturnType<typeof identityMatrix>;
  parentWorldOpacity: number;
  ancestorActive: boolean;
}): EvaluatedSceneNode {
  const { scene, node, frame } = args;
  const active = nodeActiveAtFrame(node, frame, args.ancestorActive);
  const localDurationInFrames = Math.max(0, node.endFrame - node.startFrame);
  const localFrame = frame - node.startFrame;
  const t = { ...DEFAULT_SCENE_TRANSFORM, ...node.transform };

  const animRequests: AnimationApplyRequest[] = [];
  const appliedAnimations: EvaluatedSceneNode['appliedAnimations'] = [];
  if (active) {
    for (const anim of node.animations ?? []) {
      const animLocal = localFrame - anim.startFrame;
      if (animLocal < 0 || animLocal >= anim.durationInFrames) continue;
      animRequests.push({
        animationId: anim.animation.id,
        animationVersion: anim.animation.version,
        frame: animLocal,
        fps: scene.fps,
        durationInFrames: anim.durationInFrames,
        params: anim.params,
      });
      appliedAnimations.push({
        instanceId: anim.id,
        animationId: anim.animation.id,
        animationVersion: anim.animation.version,
      });
    }
  }
  const composed = composeMotionAnimationTransforms(animRequests);

  const localMatrix = buildNodeLocalMatrix({
    layoutX: node.layout.x,
    layoutY: node.layout.y,
    layoutWidth: node.layout.width,
    layoutHeight: node.layout.height,
    transform: t,
    animationTranslateX: composed.translateX,
    animationTranslateY: composed.translateY,
    animationRotationDeg: composed.rotationDeg,
    animationScaleX: composed.scaleX,
    animationScaleY: composed.scaleY,
  });
  const worldMatrix = composeWorldMatrix(args.parentWorldMatrix, localMatrix);
  const localOpacity = t.opacity * composed.opacity;
  const worldOpacity = args.parentWorldOpacity * localOpacity;
  const localBounds: Rectangle = {
    x: 0,
    y: 0,
    width: node.layout.width,
    height: node.layout.height,
  };
  const worldBounds = worldAabb(worldMatrix, localBounds);
  const scaleFinite = Number.isFinite(t.scaleX * composed.scaleX)
    && Number.isFinite(t.scaleY * composed.scaleY);
  const visible = active && worldOpacity > 0 && scaleFinite;

  return {
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    order: node.order,
    active,
    visible,
    localFrame,
    localDurationInFrames,
    localMatrix,
    worldMatrix,
    localOpacity,
    worldOpacity,
    localBounds,
    worldBounds,
    asset: node.type === 'asset' ? { id: node.asset.id, version: node.asset.version } : undefined,
    appliedAnimations,
    warnings: [],
  };
}
