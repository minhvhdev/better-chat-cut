import { normalizeSceneDocument } from '../../../scene-graph/src/schema/scene-normalization.ts';
import { stableStringify } from '../../../scene-graph/src/schema/scene-serialization.ts';
import { sha256Hex } from './scene-clip-hash.ts';

function computeSceneContentHash(scene: unknown): string {
  return sha256Hex(stableStringify(scene));
}
import type { SceneClipBindingV1, SceneClipBindingWithoutHash } from '../contracts/scene-clip-binding.ts';
import {
  SCENE_CLIP_BINDING_SCHEMA_VERSION,
} from '../contracts/scene-clip-item.ts';
import { sceneClipDiagnostic, type SceneClipDiagnostic } from '../contracts/scene-clip-errors.ts';
import { computeSceneClipBindingPayloadHash } from './scene-clip-binding-hash.ts';
import { isJsonSerializable } from './scene-clip-serialization.ts';

const PATH_LIKE = /(?:^|[\\/])(?:[A-Za-z]:[\\/]|\/(?:Users|home|tmp|var|etc)\b)/;

export type SceneClipBindingValidationResult = {
  valid: boolean;
  binding?: SceneClipBindingV1;
  errors: SceneClipDiagnostic[];
  warnings: SceneClipDiagnostic[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validateDependencySnapshot(
  deps: unknown,
  errors: SceneClipDiagnostic[],
): deps is SceneClipBindingV1['dependencies'] {
  const record = asRecord(deps);
  if (!record) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', 'dependencies must be an object', {
      recovery: 'Regenerate binding payload from scene_draft_get_binding_payload',
    }));
    return false;
  }
  if (!Array.isArray(record.assets) || !Array.isArray(record.animations) || !asRecord(record.theme)) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', 'dependencies.assets/animations/theme required', {
      recovery: 'Regenerate binding payload from scene_draft_get_binding_payload',
    }));
    return false;
  }
  return true;
}

export function validateSceneClipBinding(
  raw: unknown,
  options: { recomputeHash?: boolean } = {},
): SceneClipBindingValidationResult {
  const errors: SceneClipDiagnostic[] = [];
  const warnings: SceneClipDiagnostic[] = [];
  const recomputeHash = options.recomputeHash !== false;

  if (!isJsonSerializable(raw) || raw === undefined) {
    return {
      valid: false,
      errors: [sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', 'Binding must be JSON-serializable', {
        recovery: 'Regenerate binding payload from scene_draft_get_binding_payload',
      })],
      warnings,
    };
  }

  const record = asRecord(raw);
  if (!record) {
    return {
      valid: false,
      errors: [sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', 'Binding must be an object', {
        recovery: 'Regenerate binding payload from scene_draft_get_binding_payload',
      })],
      warnings,
    };
  }

  if (record.schemaVersion !== SCENE_CLIP_BINDING_SCHEMA_VERSION) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion ${String(record.schemaVersion)}`, {
      recovery: 'Use schemaVersion 1.0.0',
    }));
  }
  if (record.bindingMode !== 'embedded-snapshot') {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', 'bindingMode must be embedded-snapshot', {
      recovery: 'Regenerate binding payload',
    }));
  }

  const sourceDraft = asRecord(record.sourceDraft);
  if (!sourceDraft
    || typeof sourceDraft.draftId !== 'string'
    || typeof sourceDraft.draftRevision !== 'number'
    || typeof sourceDraft.historyEntryId !== 'string'
    || typeof sourceDraft.sceneContentHash !== 'string') {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', 'sourceDraft fields are required', {
      recovery: 'Regenerate binding payload from scene draft',
    }));
  }

  for (const key of [
    'sceneContentHash',
    'dependencyFingerprint',
    'catalogRevision',
    'motionRuntimeRevision',
    'sceneRuntimeRevision',
    'bindingPayloadHash',
  ] as const) {
    if (typeof record[key] !== 'string' || !(record[key] as string).trim()) {
      errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', `Missing ${key}`, {
        path: key,
        recovery: 'Regenerate binding payload',
      }));
    }
  }

  if (!validateDependencySnapshot(record.dependencies, errors)) {
    return { valid: false, errors, warnings };
  }

  const serialized = JSON.stringify(record);
  if (PATH_LIKE.test(serialized)) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', 'Binding must not contain filesystem paths', {
      recovery: 'Regenerate binding payload; absolute paths are forbidden',
    }));
  }

  if (errors.length) return { valid: false, errors, warnings };

  const scene = record.scene;
  const normalized = normalizeSceneDocument(scene);
  if (!normalized.success) {
    return {
      valid: false,
      errors: normalized.errors.map((d) => sceneClipDiagnostic('error', d.code || 'SCENE_BINDING_SCENE_INVALID', d.message, {
        recovery: d.recovery ?? 'Fix the scene draft then regenerate the binding payload',
      })),
      warnings,
    };
  }

  const sceneHash = computeSceneContentHash(scene as never);
  if (sceneHash !== record.sceneContentHash || sceneHash !== sourceDraft!.sceneContentHash) {
    errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_SCENE_HASH_INVALID', 'Embedded scene hash does not match sceneContentHash', {
      sceneId: (scene as { id?: string }).id,
      recovery: 'Regenerate binding payload from scene_draft_get_binding_payload',
    }));
  }

  const withoutHash: SceneClipBindingWithoutHash = {
    schemaVersion: '1.0.0',
    bindingMode: 'embedded-snapshot',
    sourceDraft: {
      draftId: String(sourceDraft!.draftId),
      draftRevision: Number(sourceDraft!.draftRevision),
      historyEntryId: String(sourceDraft!.historyEntryId),
      sceneContentHash: String(sourceDraft!.sceneContentHash),
    },
    scene: scene as never,
    sceneContentHash: String(record.sceneContentHash),
    dependencyFingerprint: String(record.dependencyFingerprint),
    catalogRevision: String(record.catalogRevision),
    motionRuntimeRevision: String(record.motionRuntimeRevision),
    sceneRuntimeRevision: String(record.sceneRuntimeRevision),
    dependencies: record.dependencies as SceneClipBindingV1['dependencies'],
    sourceAssetPlan: record.sourceAssetPlan as SceneClipBindingV1['sourceAssetPlan'],
  };

  if (recomputeHash) {
    const expected = computeSceneClipBindingPayloadHash(withoutHash);
    if (expected !== record.bindingPayloadHash) {
      errors.push(sceneClipDiagnostic('error', 'SCENE_CLIP_BINDING_HASH_INVALID', 'bindingPayloadHash mismatch', {
        details: { expected, actual: record.bindingPayloadHash },
        recovery: 'Regenerate binding payload; do not edit binding fields manually',
      }));
    }
  }

  if (errors.length) return { valid: false, errors, warnings };

  const binding: SceneClipBindingV1 = {
    ...withoutHash,
    bindingPayloadHash: String(record.bindingPayloadHash),
  };
  return { valid: true, binding, errors, warnings };
}
