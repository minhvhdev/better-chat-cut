import type { SceneDocumentV1, SceneNodeV1 } from '../../../scene-graph/src/index.ts';
import type { ScenePatchOperationV1 } from '../contracts/scene-patch.ts';
import type { SceneDraftDiagnostic } from '../contracts/scene-draft-errors.ts';

export type SceneCommandContext = {
  scene: SceneDocumentV1;
  warnings: SceneDraftDiagnostic[];
};

export type SceneCommandResult = {
  scene: SceneDocumentV1;
  warnings: SceneDraftDiagnostic[];
};

export type SceneCommandHandler = (
  ctx: SceneCommandContext,
  op: ScenePatchOperationV1,
) => SceneCommandContext;

export function findNode(scene: SceneDocumentV1, nodeId: string): SceneNodeV1 | undefined {
  return scene.nodes.find((n) => n.id === nodeId);
}

export function replaceNodes(scene: SceneDocumentV1, nodes: SceneNodeV1[]): SceneDocumentV1 {
  return { ...scene, nodes };
}
