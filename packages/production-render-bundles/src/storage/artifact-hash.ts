import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sha256Hex, stableStringify } from '../../../production-render-plans/src/schema/production-render-serialization.ts';
import type { DeliveryBundleManifestWithoutHash, DeliveryBundleManifestV1 } from '../contracts/render-operation.ts';
import type { ProductionQaReportV1 } from '../contracts/qa-report.ts';

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sha256Bytes(bytes: Uint8Array | Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function computeDeliveryManifestHash(manifestWithoutHash: DeliveryBundleManifestWithoutHash): string {
  return sha256Hex(stableStringify(manifestWithoutHash));
}

export function computeQaReportHash(report: Omit<ProductionQaReportV1, 'reportHash' | 'generatedAt'>): string {
  return sha256Hex(stableStringify(report));
}

export function computeOperationInputHash(input: {
  planHash: string;
  projectId: string;
  bundleId: string;
}): string {
  return sha256Hex(stableStringify(input));
}

export type { DeliveryBundleManifestV1 };
