import { sha256Hex, stableStringify } from './narration-serialization.ts';
import type { NarrationPlanV1 } from '../contracts/narration-plan.ts';

export function computeNarrationPlanHash(plan: NarrationPlanV1): string {
  return sha256Hex(stableStringify(plan));
}
