import { normalizeScenePatch } from './patch-validator.ts';
import type { ScenePatchV1 } from '../contracts/scene-patch.ts';

export function normalizePatchForHash(patch: ScenePatchV1): ScenePatchV1 {
  return normalizeScenePatch(patch).patch;
}

export * from './draft-validator.ts';
export * from './composition-spec-validator.ts';
export * from './patch-validator.ts';
export * from './patch-serialization.ts';
export * from './patch-hash.ts';
export * from './patch-normalization.ts';
