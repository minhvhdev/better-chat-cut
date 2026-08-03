import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneDiagnostic } from '../contracts/scene-errors.ts';
import { diagnostic } from '../contracts/scene-errors.ts';
import { DEFAULT_SCENE_TRANSFORM } from '../contracts/scene-transform.ts';
import { isLoopAnimation } from '../../../motion-components/src/index.ts';

export function validateSceneTimingAndLayout(scene: SceneDocumentV1): {
  errors: SceneDiagnostic[];
  warnings: SceneDiagnostic[];
} {
  const errors: SceneDiagnostic[] = [];
  const warnings: SceneDiagnostic[] = [];
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));

  for (const node of scene.nodes) {
    if (node.startFrame < 0 || node.endFrame < 0) {
      errors.push(diagnostic('error', 'SCENE_INVALID_TIMING', 'Frames must be non-negative', { nodeId: node.id }));
    }
    if (node.startFrame >= node.endFrame) {
      errors.push(diagnostic('error', 'SCENE_INVALID_TIMING', 'endFrame must be greater than startFrame (half-open interval)', {
        nodeId: node.id,
        recovery: 'Use [startFrame, endFrame) with endFrame > startFrame',
      }));
    }
    if (node.endFrame > scene.durationInFrames) {
      errors.push(diagnostic('error', 'SCENE_INVALID_TIMING', 'endFrame cannot exceed durationInFrames', {
        nodeId: node.id,
      }));
    }
    if (node.startFrame >= scene.durationInFrames) {
      warnings.push(diagnostic('warning', 'SCENE_INVALID_TIMING', 'Node never visible within scene duration', {
        nodeId: node.id,
      }));
    }

    const t = { ...DEFAULT_SCENE_TRANSFORM, ...node.transform };
    if (t.anchorX < 0 || t.anchorX > 1 || t.anchorY < 0 || t.anchorY > 1) {
      errors.push(diagnostic('error', 'SCENE_INVALID_ANCHOR', 'anchorX/anchorY must be in 0..1', { nodeId: node.id }));
    }
    if (t.opacity < 0 || t.opacity > 1) {
      errors.push(diagnostic('error', 'SCENE_INVALID_OPACITY', 'opacity must be in 0..1', { nodeId: node.id }));
    }
    if (t.scaleX === 0 || t.scaleY === 0) {
      warnings.push(diagnostic('warning', 'SCENE_INVALID_TRANSFORM', 'Scale is zero; node may be invisible', { nodeId: node.id }));
    }
    if (t.opacity === 0) {
      warnings.push(diagnostic('warning', 'SCENE_INVALID_OPACITY', 'Node is fully transparent', { nodeId: node.id }));
    }

    const nodeDuration = node.endFrame - node.startFrame;
    for (const anim of node.animations ?? []) {
      if (anim.startFrame < 0 || anim.durationInFrames < 1) {
        errors.push(diagnostic('error', 'SCENE_INVALID_TIMING', 'Invalid animation timing', {
          nodeId: node.id,
          path: `animations.${anim.id}`,
        }));
        continue;
      }
      const animEnd = anim.startFrame + anim.durationInFrames;
      if (animEnd > nodeDuration && !isLoopAnimation(anim.animation.id)) {
        errors.push(diagnostic('error', 'SCENE_ANIMATION_OUT_OF_RANGE', 'Animation exceeds node duration', {
          nodeId: node.id,
          path: `animations.${anim.id}`,
          recovery: 'Shorten durationInFrames or use a loop preset',
        }));
      }
    }

    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent && (node.endFrame <= parent.startFrame || node.startFrame >= parent.endFrame)) {
        warnings.push(diagnostic('warning', 'SCENE_INVALID_TIMING', 'Child timing entirely outside parent timing', {
          nodeId: node.id,
        }));
      }
    }
  }

  return { errors, warnings };
}
