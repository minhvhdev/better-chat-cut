import {
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  createSceneDependencyResolver,
  createSceneValidator,
  normalizeSceneDocument,
} from '../../../scene-graph/src/index.ts';
import type { SceneDocumentV1 } from '../../../scene-graph/src/contracts/scene-document.ts';
import type { SceneDraftAssetPlanReferenceV1 } from '../../../scene-drafts/src/contracts/asset-plan-binding.ts';
import type { SceneClipBindingV1 } from '../contracts/scene-clip-binding.ts';
import type { CreateSceneDraftBindingPayloadInput } from '../contracts/scene-clip-tool-input.ts';
import { SceneClipError, sceneClipDiagnostic, type SceneClipDiagnostic } from '../contracts/scene-clip-errors.ts';
import { withBindingPayloadHash } from '../schema/scene-clip-binding-hash.ts';

export type SceneDraftBindingPayloadResult = {
  binding: SceneClipBindingV1 | null;
  source: {
    draftId: string;
    draftRevision: number;
    historyEntryId: string;
    sceneContentHash: string;
  } | null;
  validation: {
    valid: boolean;
    dependencyFingerprint?: string;
    errors: SceneClipDiagnostic[];
    warnings: SceneClipDiagnostic[];
  };
};

export interface SceneDraftBindingService {
  createBindingPayload(
    input: CreateSceneDraftBindingPayloadInput,
  ): Promise<SceneDraftBindingPayloadResult>;
}

export type SceneDraftBindingSource = {
  draftId: string;
  draftRevision: number;
  historyEntryId: string;
  sceneContentHash: string;
  scene: SceneDocumentV1;
  sourceAssetPlan?: SceneDraftAssetPlanReferenceV1;
};

function statusOf(value: string | undefined): 'staging' | 'published' | 'deprecated' {
  if (value === 'staging' || value === 'deprecated' || value === 'published') return value;
  return 'published';
}

/** Pure binding builder from an already-loaded draft scene snapshot. */
export async function buildSceneClipBindingFromScene(
  source: SceneDraftBindingSource,
): Promise<SceneDraftBindingPayloadResult> {
  const errors: SceneClipDiagnostic[] = [];
  const warnings: SceneClipDiagnostic[] = [];
  const normalizedResult = normalizeSceneDocument(source.scene);
  if (!normalizedResult.success) {
    return {
      binding: null,
      source: {
        draftId: source.draftId,
        draftRevision: source.draftRevision,
        historyEntryId: source.historyEntryId,
        sceneContentHash: source.sceneContentHash,
      },
      validation: {
        valid: false,
        errors: normalizedResult.errors.map((d) => sceneClipDiagnostic('error', d.code, d.message, {
          draftId: source.draftId,
          recovery: d.recovery,
        })),
        warnings: normalizedResult.warnings.map((d) => sceneClipDiagnostic('warning', d.code, d.message, {
          draftId: source.draftId,
          recovery: d.recovery,
        })),
      },
    };
  }
  const normalized = normalizedResult.scene;
  const hash = computeSceneContentHash(normalized);
  if (hash !== source.sceneContentHash) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_SCENE_HASH_INVALID', 'Scene hash does not match history entry', {
      draftId: source.draftId,
      sceneId: normalized.id,
      recovery: 'Re-validate the draft and retry',
    }));
  }

  const validator = createSceneValidator();
  const schema = await validator.validate(normalized);
  for (const d of schema.errors) {
    errors.push(sceneClipDiagnostic('error', d.code || 'SCENE_BINDING_SCENE_INVALID', d.message, {
      draftId: source.draftId,
      sceneId: normalized.id,
      path: d.path,
      recovery: d.recovery,
    }));
  }
  for (const d of schema.warnings) {
    warnings.push(sceneClipDiagnostic('warning', d.code, d.message, {
      draftId: source.draftId,
      recovery: d.recovery,
    }));
  }

  const resolver = createSceneDependencyResolver();
  const deps = await resolver.resolve(normalized);
  for (const d of deps.errors) {
    const code = d.code.includes('DRAFT')
      ? 'SCENE_CLIP_DRAFT_RUNTIME_NOT_ALLOWED'
      : 'SCENE_BINDING_DEPENDENCY_INVALID';
    errors.push(sceneClipDiagnostic('error', code, d.message, {
      draftId: source.draftId,
      recovery: d.recovery ?? 'Fix scene dependencies',
    }));
  }
  for (const d of deps.warnings) {
    warnings.push(sceneClipDiagnostic('warning', d.code, d.message, {
      draftId: source.draftId,
      recovery: d.recovery,
    }));
  }

  const sourceMeta = {
    draftId: source.draftId,
    draftRevision: source.draftRevision,
    historyEntryId: source.historyEntryId,
    sceneContentHash: hash,
  };

  if (errors.length || !deps.dependencyFingerprint) {
    return {
      binding: null,
      source: sourceMeta,
      validation: {
        valid: false,
        dependencyFingerprint: deps.dependencyFingerprint,
        errors,
        warnings,
      },
    };
  }

  for (const a of deps.assets) {
    if (a.status === 'draft') {
      errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_DRAFT_RUNTIME_NOT_ALLOWED', `Draft asset ${a.assetId}@${a.assetVersion}`, {
        draftId: source.draftId,
        recovery: 'Promote assets to staging/published before binding',
      }));
    }
  }
  if (errors.length) {
    return {
      binding: null,
      source: sourceMeta,
      validation: { valid: false, dependencyFingerprint: deps.dependencyFingerprint, errors, warnings },
    };
  }

  const assets = deps.assets
    .filter((a) => a.runtimeAvailable)
    .map((a) => ({
      id: a.assetId,
      version: a.assetVersion,
      contentHash: a.contentHash ?? hash,
      ...(a.implementationFingerprint ? { implementationFingerprint: a.implementationFingerprint } : {}),
      status: statusOf(a.status),
    }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));

  try {
    const binding = withBindingPayloadHash({
      schemaVersion: '1.0.0',
      bindingMode: 'embedded-snapshot',
      sourceDraft: sourceMeta,
      scene: normalized,
      sceneContentHash: hash,
      dependencyFingerprint: deps.dependencyFingerprint,
      catalogRevision: deps.catalogRevision,
      motionRuntimeRevision: deps.motionRuntimeRevision,
      sceneRuntimeRevision: computeSceneRuntimeRevision(),
      dependencies: {
        assets,
        animations: deps.animations
          .map((a) => ({ id: a.animationId, version: a.animationVersion }))
          .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version)),
        theme: {
          id: normalized.theme.id,
          version: normalized.theme.version,
        },
      },
      ...(source.sourceAssetPlan ? { sourceAssetPlan: source.sourceAssetPlan } : {}),
    });

    return {
      binding,
      source: sourceMeta,
      validation: {
        valid: true,
        dependencyFingerprint: deps.dependencyFingerprint,
        errors: [],
        warnings,
      },
    };
  } catch (error) {
    throw new SceneClipError(
      'SCENE_BINDING_PAYLOAD_HASH_FAILED',
      error instanceof Error ? error.message : String(error),
      { recovery: 'Retry binding generation; ensure scene is JSON-serializable' },
    );
  }
}
