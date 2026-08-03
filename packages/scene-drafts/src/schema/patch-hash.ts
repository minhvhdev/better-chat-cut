import type { ScenePatchV1 } from '../contracts/scene-patch.ts';
import { computeInputHash } from './patch-serialization.ts';

export function computeScenePatchHash(patch: ScenePatchV1): string {
  return computeInputHash({
    schemaVersion: patch.schemaVersion,
    id: patch.id,
    description: patch.description ?? null,
    operations: patch.operations,
  });
}
