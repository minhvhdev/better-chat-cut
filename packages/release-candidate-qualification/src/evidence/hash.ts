import { createHash } from 'node:crypto';

export function sha256Hex(value: unknown): string {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(text).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Hash evidence body excluding evidenceHash itself. */
export function hashEvidenceBody(evidence: Record<string, unknown>): string {
  const { evidenceHash: _drop, ...rest } = evidence;
  return sha256Hex(rest);
}

/** Manifest hash excludes createdAt. */
export function hashEvidenceManifestBody(manifest: Record<string, unknown>): string {
  const { manifestHash: _h, createdAt: _c, ...rest } = manifest;
  return sha256Hex(rest);
}
