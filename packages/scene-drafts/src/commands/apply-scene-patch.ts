import {
  computeSceneContentHash,
  createSceneValidator,
  type SceneDocumentV1,
} from '../../../scene-graph/src/index.ts';
import type { ScenePatchV1 } from '../contracts/scene-patch.ts';
import type { SceneChangeSummaryV1 } from '../contracts/scene-change-summary.ts';
import { SceneDraftError, type SceneDraftDiagnostic } from '../contracts/scene-draft-errors.ts';
import { normalizeScenePatch } from '../schema/patch-validator.ts';
import { computeScenePatchHash } from '../schema/patch-hash.ts';
import { deepCloneJson } from '../schema/patch-serialization.ts';
import { applyOperation } from './command-registry.ts';
import { computeSceneChangeSummary } from '../diff/change-summary.ts';

export type ApplyScenePatchResult = {
  patchHash: string;
  predictedScene: SceneDocumentV1;
  predictedSceneContentHash: string;
  changeSummary: SceneChangeSummaryV1;
  validation: {
    valid: boolean;
    errors: SceneDraftDiagnostic[];
    warnings: SceneDraftDiagnostic[];
    sceneContentHash?: string;
    dependencyFingerprint?: string;
  };
  warnings: SceneDraftDiagnostic[];
};

export async function applyScenePatch(input: {
  scene: SceneDocumentV1;
  patch: unknown;
  previousDependencyCount?: number;
}): Promise<ApplyScenePatchResult> {
  const { patch } = normalizeScenePatch(input.patch);
  const patchHash = computeScenePatchHash(patch);
  const original = deepCloneJson(input.scene);
  let ctx = { scene: deepCloneJson(input.scene), warnings: [] as SceneDraftDiagnostic[] };

  for (const op of patch.operations) {
    try {
      ctx = applyOperation(ctx, op);
    } catch (error) {
      if (error instanceof SceneDraftError) throw error;
      throw new SceneDraftError('SCENE_PATCH_OPERATION_UNSUPPORTED', String(error), {
        details: { operationId: op.operationId },
      });
    }
  }

  // Ensure input scene was not mutated
  if (JSON.stringify(input.scene) !== JSON.stringify(original)) {
    throw new SceneDraftError('SCENE_PATCH_FINAL_SCENE_INVALID', 'Patch pipeline mutated input scene');
  }

  const validator = createSceneValidator();
  const validated = await validator.validate(ctx.scene, {
    includeNormalizedScene: true,
    includeDependencies: true,
    analyzeLayout: false,
  });

  if (!validated.valid) {
    for (const err of validated.errors) {
      if (err.code.includes('PROPS') || err.code.toLowerCase().includes('props')) {
        throw new SceneDraftError('SCENE_PATCH_INVALID_PROPS', err.message, {
          recovery: err.recovery,
          details: { code: err.code },
        });
      }
      if (err.code.includes('ANIMATION') || err.code.toLowerCase().includes('animation')) {
        throw new SceneDraftError('SCENE_PATCH_INVALID_ANIMATION', err.message, {
          recovery: err.recovery,
          details: { code: err.code },
        });
      }
      if (
        err.code.includes('ASSET')
        || err.code.includes('DRAFT')
        || err.code.includes('RUNTIME')
      ) {
        throw new SceneDraftError('SCENE_PATCH_INVALID_ASSET', err.message, {
          recovery: err.recovery,
          details: { code: err.code },
        });
      }
    }
    throw new SceneDraftError('SCENE_PATCH_FINAL_SCENE_INVALID', 'Predicted scene failed Scene Graph validation', {
      diagnostics: validated.errors.map((e) => ({
        severity: 'error' as const,
        code: e.code,
        message: e.message,
        nodeId: e.nodeId,
        path: e.path,
        recovery: e.recovery,
      })),
      recovery: 'Fix patch operations so the final scene validates',
      details: { errors: validated.errors },
    });
  }
  if (!validated.normalizedScene) {
    throw new SceneDraftError('SCENE_PATCH_FINAL_SCENE_INVALID', 'Predicted scene missing normalized document');
  }

  const predictedScene = validated.normalizedScene;
  const predictedSceneContentHash = validated.sceneContentHash ?? computeSceneContentHash(predictedScene);
  const changeSummary = computeSceneChangeSummary({
    previous: original,
    next: predictedScene,
    previousDependencies: input.previousDependencyCount ?? original.nodes.filter((n) => n.type === 'asset').length,
    nextDependencies: predictedScene.nodes.filter((n) => n.type === 'asset').length,
  });

  return {
    patchHash,
    predictedScene,
    predictedSceneContentHash,
    changeSummary,
    validation: {
      valid: validated.valid,
      errors: validated.errors.map((e) => ({
        severity: e.severity,
        code: e.code,
        message: e.message,
        nodeId: e.nodeId,
        path: e.path,
        recovery: e.recovery,
      })),
      warnings: validated.warnings.map((e) => ({
        severity: e.severity,
        code: e.code,
        message: e.message,
        nodeId: e.nodeId,
        path: e.path,
        recovery: e.recovery,
      })),
      sceneContentHash: predictedSceneContentHash,
      dependencyFingerprint: validated.dependencyFingerprint,
    },
    warnings: [
      ...ctx.warnings,
      ...validated.warnings.map((e) => ({
        severity: e.severity as SceneDraftDiagnostic['severity'],
        code: e.code,
        message: e.message,
        nodeId: e.nodeId,
        path: e.path,
        recovery: e.recovery,
      })),
    ],
  };
}

export type { ScenePatchV1 };
