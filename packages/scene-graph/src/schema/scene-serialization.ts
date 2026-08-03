/** Stable JSON stringify with sorted object keys (reuse pattern from asset-hash). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function isJsonSerializable(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return Number.isFinite(value as number);
  if (type === 'undefined') return true; // omitted from object JSON; not allowed as root (caller checks)
  if (type === 'function' || type === 'symbol' || type === 'bigint') return false;
  if (type === 'object') {
    if (seen.has(value as object)) return false;
    seen.add(value as object);
    if (Array.isArray(value)) return value.every((item) => isJsonSerializable(item, seen));
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return false;
    }
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .every(([, item]) => isJsonSerializable(item, seen));
  }
  return false;
}
