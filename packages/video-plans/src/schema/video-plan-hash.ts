import { sha256Hex } from '../../../project-scene-bindings/src/schema/scene-clip-hash.ts';
import { stableStringify } from './video-plan-serialization.ts';

export { sha256Hex };

export function computeVideoPlanHash(plan: unknown): string {
  return sha256Hex(stableStringify(plan));
}
