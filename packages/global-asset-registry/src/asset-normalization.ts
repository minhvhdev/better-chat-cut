const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Map Vietnamese letters that do not decompose via NFD (notably đ/Đ). */
function foldVietnameseLetters(value: string): string {
  return value.replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export function normalizeSlug(value: string): string {
  return foldVietnameseLetters(value)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeAlias(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function uniqueNormalizedSlugs(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const slug = normalizeSlug(value);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function uniqueAliases(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const alias = normalizeAlias(value);
    if (!alias) continue;
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}

/** Search key that keeps Vietnamese aliases matchable with/without diacritics. */
export function normalizeAssetSearchText(value: string): string {
  return foldVietnameseLetters(value)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokenizeSearchText(value: string): string[] {
  const normalized = normalizeAssetSearchText(value);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

export function compareSemverDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isSafeRelativePath(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return false;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return false;
  if (trimmed.includes('\0')) return false;
  const parts = trimmed.replace(/\\/g, '/').split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return false;
  return true;
}
