import { createHash } from 'node:crypto';
import type { AssetRequirementSetV1 } from '../contracts/asset-requirement-set.ts';
import type { AssetPlanWithoutHash } from '../contracts/asset-plan.ts';
import { stableStringify } from './requirement-serialization.ts';

export function sha256Hex(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

export function computeAssetRequirementSetHash(requirementSet: AssetRequirementSetV1): string {
  return sha256Hex(stableStringify(requirementSet));
}

export function computeAssetPlanHash(planWithoutHash: AssetPlanWithoutHash): string {
  return sha256Hex(stableStringify(planWithoutHash));
}
