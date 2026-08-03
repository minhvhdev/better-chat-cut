import type {
  AssetPlanV1,
  AssetResolutionDecisionV1,
  ResolvedAssetSelectionV1,
} from '../../../asset-resolver/src/index.ts';
import type {
  SceneAssetNodeV1,
  SceneDocumentV1,
  SceneNodeV1,
} from '../../../scene-graph/src/index.ts';
import type { AssetPlanRequirementPlacementV1 } from '../contracts/asset-plan-composition-spec.ts';
import type { SceneDraftAssetBindingV1, SceneDraftAssetPlanReferenceV1 } from '../contracts/asset-plan-binding.ts';

function selectionAssets(selection: ResolvedAssetSelectionV1) {
  return [{
    id: selection.asset.id,
    version: selection.asset.version,
    contentHash: selection.asset.contentHash,
    implementationFingerprint: selection.asset.implementationFingerprint,
  }];
}

export function buildAssetPlanReference(input: {
  plan: AssetPlanV1;
  validation: { valid: boolean; stale: boolean; reusable: boolean };
  decisions: AssetResolutionDecisionV1[];
  nodesByRequirement: Map<string, string[]>;
}): SceneDraftAssetPlanReferenceV1 {
  const bindings: SceneDraftAssetBindingV1[] = [];
  for (const decision of input.decisions) {
    if (decision.status === 'skipped') continue;
    const strategy = decision.strategy;
    if (strategy !== 'exact' && strategy !== 'reuse' && strategy !== 'variant' && strategy !== 'composition') {
      continue;
    }
    const nodeIds = input.nodesByRequirement.get(decision.requirementId) ?? [];
    const assets = decision.composition
      ? decision.composition.parts.flatMap((p) => selectionAssets(p.selection))
      : decision.selection
        ? selectionAssets(decision.selection)
        : [];
    bindings.push({
      requirementId: decision.requirementId,
      strategy,
      nodeIds: [...nodeIds].sort((a, b) => a.localeCompare(b)),
      assets,
    });
  }
  bindings.sort((a, b) => a.requirementId.localeCompare(b.requirementId));
  return {
    planId: input.plan.id,
    planHash: input.plan.planHash,
    requirementSetId: input.plan.requirementSetId,
    requirementSetHash: input.plan.requirementSetHash,
    catalogRevision: input.plan.catalogRevision,
    motionRuntimeRevision: input.plan.motionRuntimeRevision,
    resolverRevision: input.plan.resolverRevision,
    validationAtComposition: input.validation,
    bindings,
  };
}

export function assetNodeFromSelection(
  placement: AssetPlanRequirementPlacementV1,
  selection: ResolvedAssetSelectionV1,
  overrides?: Partial<SceneAssetNodeV1>,
): SceneAssetNodeV1 {
  return {
    id: overrides?.id ?? placement.nodeId,
    type: 'asset',
    parentId: overrides?.parentId ?? placement.parentId,
    order: overrides?.order ?? placement.order,
    startFrame: overrides?.startFrame ?? placement.startFrame,
    endFrame: overrides?.endFrame ?? placement.endFrame,
    layout: overrides?.layout ?? placement.layout,
    transform: overrides?.transform ?? placement.transform,
    animations: overrides?.animations ?? placement.animations,
    metadata: overrides?.metadata ?? placement.metadata,
    enabled: overrides?.enabled,
    asset: {
      id: selection.asset.id,
      version: selection.asset.version,
      props: selection.props,
    },
    fit: selection.fitHint,
  };
}

export function collectSceneNodes(scene: SceneDocumentV1): SceneNodeV1[] {
  return [...scene.nodes];
}
