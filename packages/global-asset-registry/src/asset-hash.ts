import { createHash } from 'node:crypto';
import type { AssetManifestV1 } from './asset-types.ts';

/** Stable JSON stringify with sorted object keys for deterministic hashes. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function computeAssetContentHash(manifest: AssetManifestV1): string {
  return createHash('sha256').update(stableStringify(manifest)).digest('hex');
}

export function serializeManifestFile(manifest: AssetManifestV1): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
