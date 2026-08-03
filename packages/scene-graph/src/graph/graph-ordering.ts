import type { SceneNodeV1 } from '../contracts/scene-node.ts';

/** Sibling order: ascending order, then ascending id. */
export function compareSiblingOrder(a: SceneNodeV1, b: SceneNodeV1): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.id.localeCompare(b.id);
}

/**
 * Deterministic node list sort by graph traversal (roots first by sibling order,
 * then children recursively). Does not change visual sibling order semantics.
 */
export function sortNodesDeterministic(nodes: SceneNodeV1[]): SceneNodeV1[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string | undefined, SceneNodeV1[]>();
  for (const node of nodes) {
    const key = node.parentId;
    const list = children.get(key) ?? [];
    list.push(node);
    children.set(key, list);
  }
  for (const list of children.values()) {
    list.sort(compareSiblingOrder);
  }

  const ordered: SceneNodeV1[] = [];
  const visit = (parentId: string | undefined) => {
    const list = children.get(parentId) ?? [];
    for (const node of list) {
      if (!byId.has(node.id)) continue;
      ordered.push(node);
      visit(node.id);
    }
  };
  visit(undefined);

  // Append orphans (broken parent) deterministically so normalization still returns them for validation.
  const seen = new Set(ordered.map((n) => n.id));
  const orphans = nodes.filter((n) => !seen.has(n.id)).sort(compareSiblingOrder);
  return [...ordered, ...orphans];
}
