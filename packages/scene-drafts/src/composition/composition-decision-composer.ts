import type { AssetResolutionDecisionV1 } from '../../../asset-resolver/src/index.ts';
import type { SceneGroupNodeV1, SceneNodeV1 } from '../../../scene-graph/src/index.ts';
import type { AssetPlanRequirementPlacementV1 } from '../contracts/asset-plan-composition-spec.ts';
import { SceneDraftError } from '../contracts/scene-draft-errors.ts';
import { convertNormalizedBoxToLayout, resolvePartNormalizedBox } from './layout-hints.ts';
import { buildPartNodeId } from './node-id-builder.ts';
import { assetNodeFromSelection } from './asset-plan-snapshot.ts';

export function composeCompositionDecision(
  decision: AssetResolutionDecisionV1,
  placement: AssetPlanRequirementPlacementV1,
  usedNodeIds: Set<string>,
): { nodes: SceneNodeV1[]; nodeIds: string[] } {
  if (!decision.composition) {
    throw new SceneDraftError('SCENE_COMPOSITION_PLAN_INVALID', `Decision ${decision.requirementId} missing composition recipe`);
  }
  const recipe = decision.composition;
  if (usedNodeIds.has(placement.nodeId)) {
    throw new SceneDraftError('SCENE_COMPOSITION_NODE_ID_COLLISION', `Node id collision: ${placement.nodeId}`, {
      nodeId: placement.nodeId,
      requirementId: decision.requirementId,
    });
  }

  const group: SceneGroupNodeV1 = {
    id: placement.nodeId,
    type: 'group',
    parentId: placement.parentId,
    order: placement.order,
    startFrame: placement.startFrame,
    endFrame: placement.endFrame,
    layout: placement.layout,
    transform: placement.transform,
    animations: placement.animations,
    metadata: placement.metadata,
  };

  const nodes: SceneNodeV1[] = [group];
  const nodeIds = [group.id];
  usedNodeIds.add(group.id);

  const overridesByPart = new Map((placement.partOverrides ?? []).map((o) => [o.partId, o]));
  const sortedParts = [...recipe.parts].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.partId.localeCompare(b.partId);
  });

  for (const part of sortedParts) {
    const override = overridesByPart.get(part.partId);
    if (!override && !recipe.parts.some((p) => p.partId === part.partId)) {
      throw new SceneDraftError('SCENE_COMPOSITION_PART_NOT_FOUND', `Part ${part.partId} not found`);
    }
    const nodeId = override?.nodeId ?? buildPartNodeId(group.id, part.partId);
    if (usedNodeIds.has(nodeId)) {
      throw new SceneDraftError('SCENE_COMPOSITION_NODE_ID_COLLISION', `Node id collision: ${nodeId}`, {
        nodeId,
        requirementId: decision.requirementId,
      });
    }
    const parentPartId = override?.parentPartId ?? part.parentPartId;
    const parentId = parentPartId
      ? (overridesByPart.get(parentPartId)?.nodeId ?? buildPartNodeId(group.id, parentPartId))
      : group.id;

    const box = resolvePartNormalizedBox({
      layoutHint: recipe.layoutHint,
      parts: recipe.parts,
      part,
      override,
    });
    const layout = convertNormalizedBoxToLayout(group.layout, box);
    const child = assetNodeFromSelection(placement, part.selection, {
      id: nodeId,
      parentId,
      order: override?.order ?? part.order,
      startFrame: placement.startFrame,
      endFrame: placement.endFrame,
      layout,
      transform: override?.transform,
      animations: override?.animations,
      metadata: { role: part.role, label: part.partId },
    });
    nodes.push(child);
    nodeIds.push(nodeId);
    usedNodeIds.add(nodeId);
  }

  // Ensure overrides reference known parts
  for (const override of placement.partOverrides ?? []) {
    if (!recipe.parts.some((p) => p.partId === override.partId)) {
      throw new SceneDraftError('SCENE_COMPOSITION_PART_NOT_FOUND', `Override part ${override.partId} not in recipe`, {
        requirementId: decision.requirementId,
      });
    }
  }

  return { nodes, nodeIds };
}
