import {
  MAX_PATCH_OPERATIONS,
  MAX_PATCH_SERIALIZED_SIZE,
  SCENE_PATCH_SCHEMA_VERSION,
  SUPPORTED_PATCH_OPERATION_TYPES,
  type ScenePatchOperationV1,
  type ScenePatchV1,
} from '../contracts/scene-patch.ts';
import { SceneDraftError, draftDiagnostic, type SceneDraftDiagnostic } from '../contracts/scene-draft-errors.ts';
import { deepCloneJson, stableStringify } from './patch-serialization.ts';

const SUPPORTED = new Set<string>(SUPPORTED_PATCH_OPERATION_TYPES);

export function normalizeScenePatch(input: unknown): {
  patch: ScenePatchV1;
  warnings: SceneDraftDiagnostic[];
} {
  if (!input || typeof input !== 'object') {
    throw new SceneDraftError('SCENE_PATCH_SCHEMA_UNSUPPORTED', 'patch must be an object', {
      recovery: 'Pass a ScenePatchV1 object',
    });
  }
  const raw = input as ScenePatchV1;
  if (raw.schemaVersion !== SCENE_PATCH_SCHEMA_VERSION) {
    throw new SceneDraftError('SCENE_PATCH_SCHEMA_UNSUPPORTED', `Unsupported patch schemaVersion ${String(raw.schemaVersion)}`, {
      recovery: 'Use schemaVersion 1.0.0',
    });
  }
  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    throw new SceneDraftError('SCENE_PATCH_SCHEMA_UNSUPPORTED', 'patch.id is required');
  }
  if (!Array.isArray(raw.operations)) {
    throw new SceneDraftError('SCENE_PATCH_SCHEMA_UNSUPPORTED', 'patch.operations must be an array');
  }
  if (raw.operations.length > MAX_PATCH_OPERATIONS) {
    throw new SceneDraftError('SCENE_PATCH_TOO_MANY_OPERATIONS', `Patch exceeds ${MAX_PATCH_OPERATIONS} operations`, {
      recovery: 'Split into smaller patches',
    });
  }
  const serialized = stableStringify(raw);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PATCH_SERIALIZED_SIZE) {
    throw new SceneDraftError('SCENE_PATCH_TOO_LARGE', `Patch exceeds ${MAX_PATCH_SERIALIZED_SIZE} bytes`, {
      recovery: 'Reduce patch payload size',
    });
  }
  const ids = new Set<string>();
  for (const op of raw.operations) {
    if (!op || typeof op !== 'object' || typeof op.operationId !== 'string' || !op.operationId.trim()) {
      throw new SceneDraftError('SCENE_PATCH_SCHEMA_UNSUPPORTED', 'Each operation requires operationId');
    }
    if (ids.has(op.operationId)) {
      throw new SceneDraftError('SCENE_PATCH_DUPLICATE_OPERATION_ID', `Duplicate operationId ${op.operationId}`, {
        details: { operationId: op.operationId },
        recovery: 'Ensure operationIds are unique within the patch',
      });
    }
    ids.add(op.operationId);
    if (!SUPPORTED.has((op as ScenePatchOperationV1).type)) {
      throw new SceneDraftError(
        'SCENE_PATCH_OPERATION_UNSUPPORTED',
        `Unsupported operation type ${(op as { type?: string }).type}`,
        {
          details: { operationId: op.operationId },
          recovery: 'Use only documented semantic operation types',
        },
      );
    }
  }
  return {
    patch: deepCloneJson(raw),
    warnings: [],
  };
}

export function validateScenePatch(input: unknown): SceneDraftDiagnostic[] {
  try {
    normalizeScenePatch(input);
    return [];
  } catch (error) {
    if (error instanceof SceneDraftError) return error.diagnostics;
    return [draftDiagnostic('error', 'SCENE_PATCH_SCHEMA_UNSUPPORTED', String(error))];
  }
}
