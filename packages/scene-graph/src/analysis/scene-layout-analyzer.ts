import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneLayoutAnalysis } from '../contracts/scene-preview.ts';
import { diagnostic } from '../contracts/scene-errors.ts';
import { createSceneFrameEvaluator } from '../runtime/evaluate-scene-frame.ts';
import { rectFullyInside, rectFullyOutside, rectanglesOverlap } from '../geometry/index.ts';

export interface SceneLayoutAnalyzer {
  analyze(scene: SceneDocumentV1, frames?: number[]): Promise<SceneLayoutAnalysis>;
}

export async function analyzeSceneLayout(
  scene: SceneDocumentV1,
  frames?: number[],
): Promise<SceneLayoutAnalysis> {
  const sample = frames?.length
    ? frames
    : [
        0,
        Math.floor(scene.durationInFrames * 0.2),
        Math.floor(scene.durationInFrames * 0.5),
        Math.max(0, scene.durationInFrames - 1),
      ].filter((value, index, arr) => arr.indexOf(value) === index);

  const evaluator = createSceneFrameEvaluator();
  const diagnostics = [];
  const overlaps: SceneLayoutAnalysis['overlaps'] = [];
  const canvas = { x: 0, y: 0, width: scene.canvas.width, height: scene.canvas.height };
  const safe = scene.safeArea
    ? {
        x: scene.safeArea.left,
        y: scene.safeArea.top,
        width: scene.canvas.width - scene.safeArea.left - scene.safeArea.right,
        height: scene.canvas.height - scene.safeArea.top - scene.safeArea.bottom,
      }
    : null;

  for (const frame of sample) {
    if (frame < 0 || frame >= scene.durationInFrames) continue;
    const evaluation = await evaluator.evaluate(scene, frame);
    const assets = evaluation.nodes.filter((n) => n.type === 'asset' && n.visible);
    for (const node of evaluation.nodes) {
      if (!node.active) continue;
      if (rectFullyOutside(node.worldBounds, canvas)) {
        diagnostics.push(diagnostic('warning', 'SCENE_INVALID_LAYOUT', `Node fully off-canvas at frame ${frame}`, {
          nodeId: node.id,
          frame,
        }));
      } else if (!rectFullyInside(node.worldBounds, canvas)) {
        diagnostics.push(diagnostic('info', 'SCENE_INVALID_LAYOUT', `Node partially off-canvas at frame ${frame}`, {
          nodeId: node.id,
          frame,
        }));
      }
      if (safe && node.visible && !rectFullyInside(node.worldBounds, safe)) {
        diagnostics.push(diagnostic('warning', 'SCENE_INVALID_LAYOUT', `Safe-area violation at frame ${frame}`, {
          nodeId: node.id,
          frame,
        }));
      }
      if (node.worldOpacity === 0) {
        diagnostics.push(diagnostic('warning', 'SCENE_INVALID_OPACITY', `Fully transparent at frame ${frame}`, {
          nodeId: node.id,
          frame,
        }));
      }
      if (node.visible && (node.worldBounds.width < 2 || node.worldBounds.height < 2)) {
        diagnostics.push(diagnostic('info', 'SCENE_INVALID_LAYOUT', `Very small visible node at frame ${frame}`, {
          nodeId: node.id,
          frame,
        }));
      }
    }
    for (let i = 0; i < assets.length; i += 1) {
      for (let j = i + 1; j < assets.length; j += 1) {
        if (rectanglesOverlap(assets[i].worldBounds, assets[j].worldBounds)) {
          overlaps.push({
            frame,
            a: assets[i].id,
            b: assets[j].id,
            approximate: true,
          });
          diagnostics.push(diagnostic('info', 'SCENE_INVALID_LAYOUT', `Approximate AABB overlap between ${assets[i].id} and ${assets[j].id} at frame ${frame}`, {
            frame,
          }));
        }
      }
    }
  }

  for (const node of scene.nodes) {
    if (node.endFrame <= node.startFrame) continue;
    if (node.metadata?.role === 'background' && node.type === 'asset') {
      if (node.layout.x > 0 || node.layout.y > 0
        || node.layout.width < scene.canvas.width
        || node.layout.height < scene.canvas.height) {
        diagnostics.push(diagnostic('warning', 'SCENE_INVALID_LAYOUT', 'Background node does not cover canvas', {
          nodeId: node.id,
        }));
      }
    }
  }

  return {
    sceneId: scene.id,
    frames: sample,
    diagnostics,
    overlaps,
  };
}

export function createSceneLayoutAnalyzer(): SceneLayoutAnalyzer {
  return { analyze: analyzeSceneLayout };
}
