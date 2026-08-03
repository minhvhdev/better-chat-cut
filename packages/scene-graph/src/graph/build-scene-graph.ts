import type { SceneNodeV1 } from '../contracts/scene-node.ts';
import { compareSiblingOrder } from './graph-ordering.ts';

export type SceneGraph = {
  nodesById: Map<string, SceneNodeV1>;
  roots: SceneNodeV1[];
  childrenOf: Map<string, SceneNodeV1[]>;
  depthOf: Map<string, number>;
};

export function buildSceneGraph(nodes: SceneNodeV1[]): SceneGraph {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = new Map<string, SceneNodeV1[]>();
  const roots: SceneNodeV1[] = [];

  for (const node of nodes) {
    if (!node.parentId) {
      roots.push(node);
      continue;
    }
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }
  roots.sort(compareSiblingOrder);
  for (const list of childrenOf.values()) list.sort(compareSiblingOrder);

  const depthOf = new Map<string, number>();
  const walk = (node: SceneNodeV1, depth: number) => {
    depthOf.set(node.id, depth);
    for (const child of childrenOf.get(node.id) ?? []) {
      walk(child, depth + 1);
    }
  };
  for (const root of roots) walk(root, 1);

  return { nodesById, roots, childrenOf, depthOf };
}

export function traverseSceneGraph(graph: SceneGraph): SceneNodeV1[] {
  const ordered: SceneNodeV1[] = [];
  const visit = (node: SceneNodeV1) => {
    ordered.push(node);
    for (const child of graph.childrenOf.get(node.id) ?? []) visit(child);
  };
  for (const root of graph.roots) visit(root);
  return ordered;
}
