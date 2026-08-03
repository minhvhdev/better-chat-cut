import type { CSSProperties, ReactNode } from 'react';
import type { EvaluatedSceneNode } from '../contracts/scene-evaluation.ts';
import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneNodeV1 } from '../contracts/scene-node.ts';
import { SceneAssetRenderer } from './scene-asset-renderer.tsx';

export type SceneNodeRendererProps = {
  scene: SceneDocumentV1;
  node: SceneNodeV1;
  evaluated: EvaluatedSceneNode;
  children?: ReactNode;
};

function matrixToCss(matrix: EvaluatedSceneNode['worldMatrix']): string {
  const { a, b, c, d, e, f } = matrix;
  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
}

export function SceneNodeRenderer({
  scene,
  node,
  evaluated,
  children,
}: SceneNodeRendererProps) {
  if (!evaluated.active) return null;

  const style: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: node.layout.width,
    height: node.layout.height,
    opacity: evaluated.localOpacity,
    transform: matrixToCss(evaluated.localMatrix),
    transformOrigin: '0 0',
  };

  if (node.type === 'group') {
    return (
      <div data-scene-node={node.id} data-scene-type="group" style={style}>
        {children}
      </div>
    );
  }

  return (
    <div data-scene-node={node.id} data-scene-type="asset" style={style}>
      <SceneAssetRenderer
        scene={scene}
        node={node}
        localFrame={evaluated.localFrame}
        localDurationInFrames={evaluated.localDurationInFrames}
      />
    </div>
  );
}
