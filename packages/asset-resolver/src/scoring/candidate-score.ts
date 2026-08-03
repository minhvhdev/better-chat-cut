import {
  normalizeAssetSearchText,
  tokenizeSearchText,
} from '../../../global-asset-registry/src/asset-normalization.ts';
import type { AssetManifestV1 } from '../../../global-asset-registry/src/asset-types.ts';
import type { AssetResolutionReason } from '../contracts/resolution-candidate.ts';
import {
  ASSET_RESOLVER_SCORE_WEIGHTS,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
} from './scoring-constants.ts';
import type { AssetResolutionConfidence } from '../contracts/resolution-candidate.ts';
import type { AssetStatus } from '../../../global-asset-registry/src/asset-types.ts';
import { compareSemverDesc } from '../../../global-asset-registry/src/asset-normalization.ts';

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function scoreTextMatch(
  manifest: AssetManifestV1,
  queries: string[],
): { score: number; matchedFields: string[]; reasons: AssetResolutionReason[] } {
  if (!queries.length) {
    return { score: 0.5, matchedFields: [], reasons: [] };
  }
  const matchedFields: string[] = [];
  const reasons: AssetResolutionReason[] = [];
  let weighted = 0;
  let weightSum = 0;

  for (const [index, query] of queries.entries()) {
    const weight = 1 / (index + 1);
    weightSum += weight;
    const q = normalizeAssetSearchText(query);
    const tokens = tokenizeSearchText(query);
    let local = 0;
    const idNorm = normalizeAssetSearchText(manifest.id);
    const nameNorm = normalizeAssetSearchText(manifest.name);
    const aliases = (manifest.aliases ?? []).map(normalizeAssetSearchText);
    if (idNorm === q) {
      local = Math.max(local, 1);
      if (!matchedFields.includes('id')) matchedFields.push('id');
      reasons.push({ code: 'EXACT_ID_MATCH', message: `Exact id match for query "${query}"`, contribution: weight });
    }
    if (nameNorm === q) {
      local = Math.max(local, 1);
      if (!matchedFields.includes('name')) matchedFields.push('name');
      reasons.push({ code: 'EXACT_NAME_MATCH', message: `Exact name match for query "${query}"`, contribution: weight });
    }
    if (aliases.includes(q)) {
      local = Math.max(local, 0.95);
      if (!matchedFields.includes('aliases')) matchedFields.push('aliases');
      reasons.push({ code: 'ALIAS_MATCH', message: `Alias match for query "${query}"`, contribution: weight });
    }
    let tokenHits = 0;
    for (const token of tokens) {
      const haystacks = [
        idNorm,
        nameNorm,
        ...aliases,
        ...manifest.tags.map(normalizeAssetSearchText),
        ...manifest.categories.map(normalizeAssetSearchText),
        ...manifest.capabilities.map(normalizeAssetSearchText),
        ...(manifest.styleTags ?? []).map(normalizeAssetSearchText),
        normalizeAssetSearchText(manifest.description),
      ];
      if (haystacks.some((h) => h === token || h.split(' ').includes(token) || h.includes(token))) {
        tokenHits += 1;
      }
    }
    if (tokens.length) {
      const tokenScore = tokenHits / tokens.length;
      local = Math.max(local, tokenScore * 0.85);
      if (tokenHits > 0) {
        if (!matchedFields.includes('query')) matchedFields.push('query');
        reasons.push({
          code: 'QUERY_TOKEN_MATCH',
          message: `Query token overlap for "${query}"`,
          contribution: weight * tokenScore,
          details: { tokenHits, tokens: tokens.length },
        });
      }
    }
    weighted += local * weight;
  }
  const score = weightSum > 0 ? weighted / weightSum : 0;
  return { score: clamp01(score), matchedFields, reasons };
}

export function jaccard(a: string[], b: string[]): number {
  // Unspecified requirement filters are neutral.
  if (!a.length) return 0.5;
  if (!b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const item of setA) if (setB.has(item)) inter += 1;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

export function scoreCapability(
  manifest: AssetManifestV1,
  preferred: string[],
): { score: number; reasons: AssetResolutionReason[] } {
  if (!preferred.length) return { score: 0.5, reasons: [] };
  const coverage = preferred.filter((c) => manifest.capabilities.includes(c)).length / preferred.length;
  const reasons: AssetResolutionReason[] = coverage > 0
    ? [{ code: 'PREFERRED_CAPABILITY_MATCH', message: 'Preferred capability coverage', contribution: coverage }]
    : [];
  return { score: clamp01(coverage), reasons };
}

export function scoreKind(
  manifest: AssetManifestV1,
  preferred?: string[],
  allowed?: string[],
): { score: number; reasons: AssetResolutionReason[] } {
  if (!preferred?.length && !allowed?.length) return { score: 0.5, reasons: [] };
  if (preferred?.includes(manifest.kind)) {
    return { score: 1, reasons: [{ code: 'PREFERRED_KIND_MATCH', message: 'Preferred kind match', contribution: 1 }] };
  }
  if (allowed?.includes(manifest.kind)) {
    return { score: 0.5, reasons: [{ code: 'PREFERRED_KIND_MATCH', message: 'Allowed kind match', contribution: 0.5 }] };
  }
  return { score: 0, reasons: [] };
}

export function scoreStatus(status: AssetStatus, deprecatedExact = false): { score: number; reasons: AssetResolutionReason[] } {
  if (status === 'published') {
    return { score: 1, reasons: [{ code: 'PUBLISHED_STATUS', message: 'Published status', contribution: 1 }] };
  }
  if (status === 'staging') {
    return { score: 0.7, reasons: [{ code: 'STAGING_STATUS', message: 'Staging status', contribution: 0.7 }] };
  }
  if (status === 'deprecated' && deprecatedExact) {
    return { score: 0.3, reasons: [{ code: 'DEPRECATED_EXACT_PIN_WARNING', message: 'Deprecated exact pin', contribution: 0.3 }] };
  }
  return { score: 0, reasons: [] };
}

export function scorePreferredAsset(manifestId: string, preferredIds?: string[]): { score: number; reasons: AssetResolutionReason[] } {
  if (!preferredIds?.length) return { score: 0.5, reasons: [] };
  if (preferredIds.includes(manifestId)) {
    return { score: 1, reasons: [{ code: 'PREFERRED_ASSET', message: 'Preferred asset id', contribution: 1 }] };
  }
  return { score: 0, reasons: [] };
}

export function combineCandidateScore(parts: {
  text: number;
  capability: number;
  kind: number;
  category: number;
  tag: number;
  style: number;
  props: number;
  preferredAsset: number;
  status: number;
  reuse: number;
}): number {
  const w = ASSET_RESOLVER_SCORE_WEIGHTS;
  return clamp01(
    parts.text * w.text
    + parts.capability * w.capability
    + parts.kind * w.kind
    + parts.category * w.category
    + parts.tag * w.tag
    + parts.style * w.style
    + parts.props * w.props
    + parts.preferredAsset * w.preferredAsset
    + parts.status * w.status
    + parts.reuse * w.reuse,
  );
}

export function confidenceFor(score: number, minimumScore: number, exact = false): AssetResolutionConfidence | null {
  if (exact) return 'exact';
  if (score >= CONFIDENCE_HIGH) return 'high';
  if (score >= CONFIDENCE_MEDIUM) return 'medium';
  if (score >= minimumScore) return 'low';
  return null;
}

export function tieBreakCandidates<T extends {
  score: number;
  exactPin?: boolean;
  status: AssetStatus;
  preferred?: boolean;
  runtimeVerified?: boolean;
  assetId: string;
  assetVersion: string;
}>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (Boolean(b.exactPin) !== Boolean(a.exactPin)) return Number(Boolean(b.exactPin)) - Number(Boolean(a.exactPin));
    const statusRank = (s: AssetStatus) => (s === 'published' ? 2 : s === 'staging' ? 1 : 0);
    const statusDiff = statusRank(b.status) - statusRank(a.status);
    if (statusDiff !== 0) return statusDiff;
    if (Boolean(b.preferred) !== Boolean(a.preferred)) return Number(Boolean(b.preferred)) - Number(Boolean(a.preferred));
    if (Boolean(b.runtimeVerified) !== Boolean(a.runtimeVerified)) {
      return Number(Boolean(b.runtimeVerified)) - Number(Boolean(a.runtimeVerified));
    }
    const idDiff = a.assetId.localeCompare(b.assetId);
    if (idDiff !== 0) return idDiff;
    return compareSemverDesc(a.assetVersion, b.assetVersion);
  });
}

export function clampScore(n: number): number {
  return clamp01(n);
}
