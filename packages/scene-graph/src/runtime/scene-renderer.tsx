import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import { evaluateSceneNodeAtFrame } from './evaluate-scene-node.ts';
import { buildSceneGraph } from '../graph/build-scene-graph.ts';
import { identityMatrix } from '../geometry/index.ts';
import { SceneNodeRenderer } from './scene-node-renderer.tsx';
import { ensureBetterChatCutMotionRuntime } from '../../../motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

export type SceneRuntimeRendererProps = {
  scene: SceneDocumentV1;
  frame: number;
};

/**
 * Renders a normalized/validated scene at an exact frame.
 * Uses Composite Motion Runtime only (no draft candidate bundles).
 */
export function SceneRuntimeRenderer({ scene, frame }: SceneRuntimeRendererProps) {
  const graph = buildSceneGraph(scene.nodes);

  const renderTree = (
    nodeId: string,
    parentWorldMatrix: ReturnType<typeof identityMatrix>,
    parentWorldOpacity: number,
    ancestorActive: boolean,
  ): ReactNode => {
    const node = graph.nodesById.get(nodeId);
    if (!node) return null;
    const evaluated = evaluateSceneNodeAtFrame({
      scene,
      node,
      frame,
      parentWorldMatrix,
      parentWorldOpacity,
      ancestorActive,
    });
    const children = (graph.childrenOf.get(node.id) ?? []).map((child) =>
      renderTree(child.id, evaluated.worldMatrix, evaluated.worldOpacity, evaluated.active));

    return (
      <SceneNodeRenderer
        key={node.id}
        scene={scene}
        node={node}
        evaluated={evaluated}
      >
        {children}
      </SceneNodeRenderer>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: scene.canvas.backgroundColor, overflow: 'hidden' }}>
      <div
        style={{
          position: 'relative',
          width: scene.canvas.width,
          height: scene.canvas.height,
        }}
      >
        {graph.roots.map((root) => renderTree(root.id, identityMatrix(), 1, true))}
      </div>
    </AbsoluteFill>
  );
}
