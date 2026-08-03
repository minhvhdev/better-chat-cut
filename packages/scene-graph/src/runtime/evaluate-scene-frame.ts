import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneFrameEvaluation } from '../contracts/scene-evaluation.ts';
import { buildSceneGraph, traverseSceneGraph } from '../graph/build-scene-graph.ts';
import { identityMatrix } from '../geometry/index.ts';
import { computeSceneContentHash } from '../schema/scene-hash.ts';
import { createSceneDependencyResolver } from '../dependencies/scene-dependency-resolver.ts';
import { evaluateSceneNodeAtFrame } from './evaluate-scene-node.ts';

export { evaluateSceneNodeAtFrame } from './evaluate-scene-node.ts';

export interface SceneFrameEvaluator {
  evaluate(scene: SceneDocumentV1, frame: number): Promise<SceneFrameEvaluation>;
}

export function createSceneFrameEvaluator(options?: {
  roots?: Parameters<typeof createSceneDependencyResolver>[0] extends { roots?: infer R } ? R : never;
}): SceneFrameEvaluator {
  const resolver = createSceneDependencyResolver({ roots: options?.roots as never });
  return {
    async evaluate(scene, frame): Promise<SceneFrameEvaluation> {
      if (!Number.isInteger(frame) || frame < 0 || frame >= scene.durationInFrames) {
        throw Object.assign(new Error(`Invalid frame ${frame}`), {
          code: 'SCENE_INVALID_FRAME',
          recovery: `Use an integer in 0..${scene.durationInFrames - 1}`,
        });
      }
      const deps = await resolver.resolve(scene);
      if (deps.errors.length) {
        throw Object.assign(new Error(deps.errors.map((e) => e.message).join('; ')), {
          code: 'SCENE_EVALUATION_FAILED',
          details: { errors: deps.errors },
        });
      }

      const graph = buildSceneGraph(scene.nodes);
      const evaluatedById = new Map<string, ReturnType<typeof evaluateSceneNodeAtFrame>>();
      const walk = (
        node: (typeof scene.nodes)[number],
        parentWorldMatrix: ReturnType<typeof identityMatrix>,
        parentWorldOpacity: number,
        ancestorActive: boolean,
      ) => {
        const evaluated = evaluateSceneNodeAtFrame({
          scene,
          node,
          frame,
          parentWorldMatrix,
          parentWorldOpacity,
          ancestorActive,
        });
        evaluatedById.set(node.id, evaluated);
        for (const child of graph.childrenOf.get(node.id) ?? []) {
          walk(child, evaluated.worldMatrix, evaluated.worldOpacity, evaluated.active);
        }
      };
      for (const root of graph.roots) {
        walk(root, identityMatrix(), 1, true);
      }

      const ordered = traverseSceneGraph(graph)
        .map((node) => evaluatedById.get(node.id)!)
        .filter(Boolean);

      return {
        sceneId: scene.id,
        frame,
        sceneContentHash: computeSceneContentHash(scene),
        dependencyFingerprint: deps.dependencyFingerprint ?? '',
        canvas: { width: scene.canvas.width, height: scene.canvas.height },
        nodes: ordered,
        diagnostics: [...deps.warnings],
      };
    },
  };
}
