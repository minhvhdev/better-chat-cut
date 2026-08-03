import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { EvaluatedSceneNode } from '../contracts/scene-evaluation.ts';
import type { SceneNodeV1 } from '../contracts/scene-node.ts';
import { SceneNodeRenderer } from './scene-node-renderer.tsx';

export type SceneGroupRendererProps = {
  scene: SceneDocumentV1;
  node: SceneNodeV1;
  evaluated: EvaluatedSceneNode;
  children?: React.ReactNode;
};

/** Group has no visual output of its own; wraps descendants with transform/opacity. */
export function SceneGroupRenderer(props: SceneGroupRendererProps) {
  return <SceneNodeRenderer {...props} />;
}
