import type { AssetPlanSceneCompositionSpecV1 } from '../contracts/asset-plan-composition-spec.ts';
import { SceneDraftError, draftDiagnostic, type SceneDraftDiagnostic } from '../contracts/scene-draft-errors.ts';
import { assertSafeDraftId } from './draft-validator.ts';

export function validateCompositionSpec(
  spec: unknown,
): { ok: true; spec: AssetPlanSceneCompositionSpecV1; warnings: SceneDraftDiagnostic[] } | { ok: false; errors: SceneDraftDiagnostic[] } {
  const errors: SceneDraftDiagnostic[] = [];
  const warnings: SceneDraftDiagnostic[] = [];
  if (!spec || typeof spec !== 'object') {
    return {
      ok: false,
      errors: [draftDiagnostic('error', 'SCENE_COMPOSITION_PLAN_INVALID', 'compositionSpec must be an object')],
    };
  }
  const raw = spec as AssetPlanSceneCompositionSpecV1;
  if (raw.schemaVersion !== '1.0.0') {
    errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_PLAN_INVALID', 'Unsupported compositionSpec schemaVersion'));
  }
  if (!raw.draft || typeof raw.draft !== 'object') {
    errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_PLAN_INVALID', 'draft block is required'));
  } else {
    try {
      assertSafeDraftId(raw.draft.draftId);
    } catch (error) {
      if (error instanceof SceneDraftError) {
        errors.push(...error.diagnostics);
      } else {
        errors.push(draftDiagnostic('error', 'SCENE_DRAFT_INVALID_ID', 'Invalid draftId'));
      }
    }
    if (typeof raw.draft.name !== 'string' || !raw.draft.name.trim()) {
      errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_PLAN_INVALID', 'draft.name is required'));
    }
  }
  if (!raw.scene || typeof raw.scene !== 'object') {
    errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_PLAN_INVALID', 'scene block is required'));
  }
  if (!Array.isArray(raw.placements)) {
    errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_PLAN_INVALID', 'placements must be an array'));
  } else {
    const reqIds = new Set<string>();
    const nodeIds = new Set<string>();
    for (const placement of raw.placements) {
      if (!placement || typeof placement !== 'object') {
        errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_PLAN_INVALID', 'Invalid placement entry'));
        continue;
      }
      if (reqIds.has(placement.requirementId)) {
        errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_DUPLICATE_PLACEMENT', `Duplicate placement for ${placement.requirementId}`, {
          requirementId: placement.requirementId,
        }));
      }
      reqIds.add(placement.requirementId);
      if (nodeIds.has(placement.nodeId)) {
        errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_NODE_ID_COLLISION', `Duplicate nodeId ${placement.nodeId}`, {
          nodeId: placement.nodeId,
          requirementId: placement.requirementId,
        }));
      }
      nodeIds.add(placement.nodeId);
      if (placement.partOverrides) {
        for (const override of placement.partOverrides) {
          if (override.nodeId) {
            if (nodeIds.has(override.nodeId)) {
              errors.push(draftDiagnostic('error', 'SCENE_COMPOSITION_NODE_ID_COLLISION', `Duplicate nodeId ${override.nodeId}`, {
                nodeId: override.nodeId,
                requirementId: placement.requirementId,
              }));
            }
            nodeIds.add(override.nodeId);
          }
        }
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    spec: {
      ...raw,
      omitOptionalSkippedRequirements: raw.omitOptionalSkippedRequirements !== false,
    },
    warnings,
  };
}
