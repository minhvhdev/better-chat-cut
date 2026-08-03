import type {
  AssetPlanV1,
  AssetResolutionDecisionV1,
  ResolvedAssetSelectionV1,
} from '../../../asset-resolver/src/index.ts';
import type { SceneAssetNodeV1 } from '../../../scene-graph/src/index.ts';
import type { AssetPlanRequirementPlacementV1 } from '../contracts/asset-plan-composition-spec.ts';
import { assetNodeFromSelection } from './asset-plan-snapshot.ts';

export function composeDirectOrVariantDecision(
  decision: AssetResolutionDecisionV1,
  placement: AssetPlanRequirementPlacementV1,
): { nodes: SceneAssetNodeV1[]; nodeIds: string[] } {
  if (!decision.selection) {
    throw new Error(`Decision ${decision.requirementId} missing selection`);
  }
  const node = assetNodeFromSelection(placement, decision.selection as ResolvedAssetSelectionV1);
  return { nodes: [node], nodeIds: [node.id] };
}

export function isDirectStrategy(strategy: string): boolean {
  return strategy === 'exact' || strategy === 'reuse' || strategy === 'variant';
}

export function assertPlanUsable(plan: AssetPlanV1): void {
  void plan;
}
