/** Deterministic transcript / narration normalization for alignment. */

const PUNCT_RE = /[^\p{L}\p{N}\s]/gu;

export function normalizeForComparison(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripPunctuation(text: string): string {
  return normalizeForComparison(text).replace(PUNCT_RE, '').replace(/\s+/g, ' ').trim();
}

/** Vietnamese accent-insensitive comparison form (đ → d). */
export function stripAccents(text: string): string {
  return stripPunctuation(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

export function tokenizeAlignment(text: string): string[] {
  const normalized = stripAccents(text);
  if (!normalized) return [];
  // CJK: character tokens when no spaces
  if (!/\s/.test(normalized) && /[\u3040-\u30ff\u3400-\u9fff]/.test(normalized)) {
    return [...normalized].filter((ch) => ch.trim());
  }
  return normalized.split(/\s+/).filter(Boolean);
}
