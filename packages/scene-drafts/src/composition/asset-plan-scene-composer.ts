import type { AssetPlanV1, AssetPlanValidationResult } from '../../../asset-resolver/src/index.ts';
import {
  SCENE_SCHEMA_VERSION,
  type SceneDocumentV1,
  type SceneNodeV1,
} from '../../../scene-graph/src/index.ts';
import type { AssetPlanSceneCompositionSpecV1 } from '../contracts/asset-plan-composition-spec.ts';
import type { SceneDraftAssetPlanReferenceV1 } from '../contracts/asset-plan-binding.ts';
import { SceneDraftError, draftDiagnostic, type SceneDraftDiagnostic } from '../contracts/scene-draft-errors.ts';
import { validateCompositionSpec } from '../schema/composition-spec-validator.ts';
import { composeCompositionDecision } from './composition-decision-composer.ts';
import { composeDirectOrVariantDecision, isDirectStrategy } from './direct-decision-composer.ts';
import { buildAssetPlanReference } from './asset-plan-snapshot.ts';

export type AssetPlanComposeResult = {
  scene: SceneDocumentV1;
  sourceAssetPlan: SceneDraftAssetPlanReferenceV1;
  warnings: SceneDraftDiagnostic[];
};

export function composeSceneFromAssetPlan(input: {
  plan: AssetPlanV1;
  compositionSpec: AssetPlanSceneCompositionSpecV1;
  planValidation: AssetPlanValidationResult;
}): AssetPlanComposeResult {
  const warnings: SceneDraftDiagnostic[] = [];
  const plan = input.plan;
  const planValidation = input.planValidation;

  if (!planValidation.valid) {
    throw new SceneDraftError('SCENE_COMPOSITION_PLAN_INVALID', 'AssetPlan validation failed', {
      diagnostics: planValidation.errors.map((e) => draftDiagnostic('error', e.code, e.message, {
        requirementId: e.requirementId,
        recovery: e.recovery,
      })),
      recovery: 'Fix plan errors or re-run asset_resolve_batch',
    });
  }
  if (planValidation.stale && !planValidation.reusable) {
    throw new SceneDraftError(
      'SCENE_COMPOSITION_PLAN_STALE_UNUSABLE',
      'AssetPlan is stale and dependencies are not reusable',
      { recovery: 'Re-run asset_resolve_batch against the current catalog' },
    );
  }
  if (planValidation.stale && planValidation.reusable) {
    warnings.push(draftDiagnostic(
      'warning',
      'ASSET_PLAN_STALE_REUSABLE',
      'AssetPlan is stale but selected dependencies remain reusable',
      { recovery: 'Compose allowed; refresh plan when convenient' },
    ));
  }

  const validatedSpec = validateCompositionSpec(input.compositionSpec);
  if (!validatedSpec.ok) {
    throw new SceneDraftError('SCENE_COMPOSITION_PLAN_INVALID', 'Composition spec invalid', {
      diagnostics: validatedSpec.errors,
      recovery: 'Fix compositionSpec placements',
    });
  }
  warnings.push(...validatedSpec.warnings);
  const spec = validatedSpec.spec;
  const omitOptionalSkipped = spec.omitOptionalSkippedRequirements !== false;

  const decisionsById = new Map(plan.decisions.map((d) => [d.requirementId, d]));
  const placementByReq = new Map(spec.placements.map((p) => [p.requirementId, p]));

  // Validate placements vs decisions
  for (const decision of plan.decisions) {
    const placement = placementByReq.get(decision.requirementId);
    if (decision.status === 'skipped') {
      if (decision.optional && omitOptionalSkipped) {
        if (placement) {
          warnings.push(draftDiagnostic(
            'warning',
            'SCENE_COMPOSITION_PLACEMENT_MISSING',
            `Placement for skipped optional requirement ${decision.requirementId} will be ignored`,
            { requirementId: decision.requirementId },
          ));
        }
        continue;
      }
    }
    if (decision.status === 'unresolved' || decision.status === 'blocked' || decision.status === 'partially-resolved') {
      if (decision.optional && omitOptionalSkipped) continue;
      throw new SceneDraftError(
        'SCENE_COMPOSITION_REQUIRED_DECISION_UNRESOLVED',
        `Required decision ${decision.requirementId} is ${decision.status}`,
        {
          requirementId: decision.requirementId,
          recovery: 'Resolve the requirement or mark it optional and omit',
        },
      );
    }
    if (
      decision.creationBrief
      || decision.strategy === 'review-duplicate'
      || decision.strategy === 'create-new'
      || decision.strategy === 'none'
    ) {
      throw new SceneDraftError(
        'SCENE_COMPOSITION_REQUIRED_DECISION_UNRESOLVED',
        `Decision ${decision.requirementId} strategy ${decision.strategy} cannot be composed`,
        {
          requirementId: decision.requirementId,
          recovery: 'Only exact/reuse/variant/composition decisions can be composed in M4A',
        },
      );
    }
    if (!placement) {
      throw new SceneDraftError(
        'SCENE_COMPOSITION_PLACEMENT_MISSING',
        `Missing placement for requirement ${decision.requirementId}`,
        {
          requirementId: decision.requirementId,
          recovery: 'Provide one placement per resolved requirement',
        },
      );
    }
  }

  if (!plan.complete) {
    const blocking = plan.decisions.filter((d) => {
      if (d.status === 'resolved') return false;
      if (d.optional && omitOptionalSkipped && (d.status === 'skipped' || d.status === 'unresolved' || d.status === 'blocked')) {
        return false;
      }
      return true;
    });
    if (blocking.length) {
      throw new SceneDraftError(
        'SCENE_COMPOSITION_REQUIRED_DECISION_UNRESOLVED',
        'AssetPlan is incomplete with required unresolved decisions',
        {
          recovery: 'Resolve required decisions or omit optional ones',
          details: { requirementIds: blocking.map((d) => d.requirementId) },
        },
      );
    }
  }

  for (const placement of spec.placements) {
    const decision = decisionsById.get(placement.requirementId);
    if (!decision) {
      throw new SceneDraftError(
        'SCENE_COMPOSITION_PLAN_INVALID',
        `Placement references unknown requirement ${placement.requirementId}`,
        { requirementId: placement.requirementId },
      );
    }
    if (decision.status === 'blocked' || decision.status === 'unresolved') {
      if (!(decision.optional && omitOptionalSkipped)) {
        throw new SceneDraftError(
          'SCENE_COMPOSITION_REQUIRED_DECISION_UNRESOLVED',
          `Placement references ${decision.status} requirement ${placement.requirementId}`,
          { requirementId: placement.requirementId },
        );
      }
    }
  }

  const nodes: SceneNodeV1[] = [];
  const usedNodeIds = new Set<string>();
  const nodesByRequirement = new Map<string, string[]>();
  const composedDecisions = [];

  for (const placement of [...spec.placements].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.requirementId.localeCompare(b.requirementId);
  })) {
    const decision = decisionsById.get(placement.requirementId)!;
    if (decision.status === 'skipped' && decision.optional && omitOptionalSkipped) continue;
    if (decision.status !== 'resolved') continue;

    if (isDirectStrategy(decision.strategy)) {
      const result = composeDirectOrVariantDecision(decision, placement);
      for (const node of result.nodes) {
        if (usedNodeIds.has(node.id)) {
          throw new SceneDraftError('SCENE_COMPOSITION_NODE_ID_COLLISION', `Node id collision: ${node.id}`, {
            nodeId: node.id,
            requirementId: decision.requirementId,
          });
        }
        usedNodeIds.add(node.id);
        nodes.push(node);
      }
      nodesByRequirement.set(decision.requirementId, result.nodeIds);
      composedDecisions.push(decision);
      continue;
    }

    if (decision.strategy === 'composition') {
      const result = composeCompositionDecision(decision, placement, usedNodeIds);
      nodes.push(...result.nodes);
      nodesByRequirement.set(decision.requirementId, result.nodeIds);
      composedDecisions.push(decision);
      continue;
    }

    throw new SceneDraftError(
      'SCENE_COMPOSITION_REQUIRED_DECISION_UNRESOLVED',
      `Unsupported compose strategy ${decision.strategy}`,
      { requirementId: decision.requirementId },
    );
  }

  const scene: SceneDocumentV1 = {
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: spec.scene.id,
    name: spec.scene.name,
    description: spec.scene.description,
    canvas: spec.scene.canvas,
    fps: spec.scene.fps,
    durationInFrames: spec.scene.durationInFrames,
    theme: spec.scene.theme,
    safeArea: spec.scene.safeArea,
    nodes,
  };

  const sourceAssetPlan = buildAssetPlanReference({
    plan,
    validation: {
      valid: planValidation.valid,
      stale: planValidation.stale,
      reusable: planValidation.reusable,
    },
    decisions: composedDecisions,
    nodesByRequirement,
  });

  return { scene, sourceAssetPlan, warnings };
}
