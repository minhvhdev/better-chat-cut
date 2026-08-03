import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import type { SceneDiagnostic } from '../contracts/scene-errors.ts';
import { diagnostic } from '../contracts/scene-errors.ts';
import { SCENE_LIMITS } from '../contracts/scene-document.ts';
import { buildSceneGraph } from './build-scene-graph.ts';
import { compareSiblingOrder } from './graph-ordering.ts';

export type GraphValidationResult = {
  errors: SceneDiagnostic[];
  warnings: SceneDiagnostic[];
  maxDepth: number;
};

export function validateSceneGraphStructure(scene: SceneDocumentV1): GraphValidationResult {
  const errors: SceneDiagnostic[] = [];
  const warnings: SceneDiagnostic[] = [];
  const seen = new Set<string>();

  for (const node of scene.nodes) {
    if (seen.has(node.id)) {
      errors.push(diagnostic('error', 'SCENE_DUPLICATE_NODE_ID', `Duplicate node id "${node.id}"`, {
        nodeId: node.id,
        path: `nodes.${node.id}`,
      }));
    }
    seen.add(node.id);
  }

  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  for (const node of scene.nodes) {
    if (!node.parentId) continue;
    if (node.parentId === node.id) {
      errors.push(diagnostic('error', 'SCENE_GRAPH_CYCLE', 'Node cannot parent itself', {
        nodeId: node.id,
      }));
      continue;
    }
    const parent = byId.get(node.parentId);
    if (!parent) {
      errors.push(diagnostic('error', 'SCENE_PARENT_NOT_FOUND', `Parent "${node.parentId}" not found`, {
        nodeId: node.id,
        path: `nodes.${node.id}.parentId`,
        recovery: 'Set parentId to an existing group node',
      }));
      continue;
    }
    if (parent.type !== 'group') {
      errors.push(diagnostic('error', 'SCENE_PARENT_NOT_GROUP', 'Parent must be a group node', {
        nodeId: node.id,
        path: `nodes.${node.id}.parentId`,
      }));
    }
  }

  // Cycle detection via DFS colors
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const node = byId.get(id);
    if (node?.parentId) {
      if (visit(node.parentId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const node of scene.nodes) {
    if (visit(node.id)) {
      errors.push(diagnostic('error', 'SCENE_GRAPH_CYCLE', `Cycle detected involving "${node.id}"`, {
        nodeId: node.id,
        recovery: 'Remove cyclic parentId references',
      }));
      break;
    }
  }

  const graph = buildSceneGraph(scene.nodes);
  let maxDepth = 0;
  for (const depth of graph.depthOf.values()) maxDepth = Math.max(maxDepth, depth);
  if (maxDepth > SCENE_LIMITS.MAX_GRAPH_DEPTH) {
    errors.push(diagnostic('error', 'SCENE_GRAPH_TOO_DEEP', `Graph depth ${maxDepth} exceeds ${SCENE_LIMITS.MAX_GRAPH_DEPTH}`, {
      recovery: 'Flatten nested groups',
    }));
  }

  // Duplicate sibling order warnings
  const siblingGroups = new Map<string, typeof scene.nodes>();
  for (const node of scene.nodes) {
    const key = node.parentId ?? '__root__';
    const list = siblingGroups.get(key) ?? [];
    list.push(node);
    siblingGroups.set(key, list);
  }
  for (const list of siblingGroups.values()) {
    const sorted = [...list].sort(compareSiblingOrder);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].order === sorted[i - 1].order) {
        warnings.push(diagnostic('warning', 'SCENE_DUPLICATE_SIBLING_ORDER', `Sibling order ${sorted[i].order} shared by ${sorted[i - 1].id} and ${sorted[i].id}`, {
          nodeId: sorted[i].id,
          recovery: 'Use unique order values; ties break by node id',
        }));
      }
    }
  }

  // Animation id uniqueness per node
  for (const node of scene.nodes) {
    const animIds = new Set<string>();
    for (const anim of node.animations ?? []) {
      if (animIds.has(anim.id)) {
        errors.push(diagnostic('error', 'SCENE_INVALID_ID', `Duplicate animation id "${anim.id}" on node`, {
          nodeId: node.id,
        }));
      }
      animIds.add(anim.id);
    }
  }

  return { errors, warnings, maxDepth };
}
