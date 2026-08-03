import { compareSemverDesc, normalizeAssetSearchText, normalizeSlug, tokenizeSearchText } from './asset-normalization.ts';
import type {
  AssetKind,
  AssetManifestSummary,
  AssetManifestV1,
  AssetStatus,
} from './asset-types.ts';
import { STATUS_PRIORITY } from './asset-errors.ts';

export type AssetSimilarityLevel = 'exact' | 'likely' | 'possible' | 'weak';

export type AssetSimilarityCandidate = {
  id?: string;
  version?: string;
  name: string;
  description?: string;
  kind?: AssetKind;
  categories?: string[];
  tags?: string[];
  aliases?: string[];
  capabilities?: string[];
  styleTags?: string[];
};

export type AssetSimilarityMatch = {
  asset: AssetManifestSummary;
  score: number;
  level: AssetSimilarityLevel;
  matchedFields: string[];
  reasons: string[];
};

export type AssetSimilarityResult = {
  catalogRevision: string;
  candidate: AssetSimilarityCandidate;
  items: AssetSimilarityMatch[];
};

function summaryOf(manifest: AssetManifestV1): AssetManifestSummary {
  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    kind: manifest.kind,
    status: manifest.status,
    categories: [...manifest.categories],
    tags: [...manifest.tags],
    capabilities: [...manifest.capabilities],
    styleTags: [...(manifest.styleTags ?? [])],
    implementationType: manifest.implementation.type,
    license: { spdx: manifest.license.spdx },
  };
}

function levelFor(score: number): AssetSimilarityLevel {
  if (score >= 900) return 'exact';
  if (score >= 600) return 'likely';
  if (score >= 300) return 'possible';
  return 'weak';
}

export function findSimilarAssets(
  manifests: AssetManifestV1[],
  candidate: AssetSimilarityCandidate,
  catalogRevision: string,
  options?: { statuses?: AssetStatus[]; limit?: number },
): AssetSimilarityResult {
  const limit = options?.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new Error('limit must be an integer between 1 and 30');
  }
  const statuses = new Set(options?.statuses?.length ? options.statuses : ['published', 'staging'] as AssetStatus[]);
  const nameNorm = normalizeAssetSearchText(candidate.name);
  const idNorm = candidate.id ? normalizeAssetSearchText(candidate.id) : '';
  const aliasNorms = (candidate.aliases ?? []).map(normalizeAssetSearchText);
  const categories = (candidate.categories ?? []).map(normalizeSlug).filter(Boolean);
  const tags = (candidate.tags ?? []).map(normalizeSlug).filter(Boolean);
  const capabilities = (candidate.capabilities ?? []).map(normalizeSlug).filter(Boolean);
  const styleTags = (candidate.styleTags ?? []).map(normalizeSlug).filter(Boolean);
  const descTokens = tokenizeSearchText(candidate.description ?? '');

  const items: AssetSimilarityMatch[] = [];
  for (const manifest of manifests) {
    if (!statuses.has(manifest.status)) continue;
    let score = 0;
    const matchedFields: string[] = [];
    const reasons: string[] = [];

    const add = (field: string, reason: string, weight: number) => {
      score += weight;
      if (!matchedFields.includes(field)) matchedFields.push(field);
      reasons.push(reason);
    };

    if (idNorm && normalizeAssetSearchText(manifest.id) === idNorm) add('id', 'exact id', 1000);
    if (normalizeAssetSearchText(manifest.name) === nameNorm) add('name', 'exact name', 800);
    const aliases = (manifest.aliases ?? []).map(normalizeAssetSearchText);
    if (aliases.includes(nameNorm) || aliasNorms.some((alias) => aliases.includes(alias))) {
      add('aliases', 'alias overlap', 700);
    }
    if (candidate.kind && manifest.kind === candidate.kind) add('kind', 'same kind', 200);
    if (categories.some((c) => manifest.categories.includes(c))) add('categories', 'category overlap', 150);
    if (tags.some((t) => manifest.tags.includes(t))) add('tags', 'tag overlap', 150);
    if (capabilities.some((c) => manifest.capabilities.includes(c))) add('capabilities', 'capability overlap', 180);
    if (styleTags.some((t) => (manifest.styleTags ?? []).includes(t))) add('styleTags', 'style overlap', 100);
    if (descTokens.some((token) => normalizeAssetSearchText(manifest.description).split(' ').includes(token))) {
      add('description', 'description token overlap', 80);
    }

    if (score <= 0) continue;
    items.push({
      asset: summaryOf(manifest),
      score,
      level: levelFor(score),
      matchedFields,
      reasons,
    });
  }

  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const statusDiff = (STATUS_PRIORITY[b.asset.status] ?? 0) - (STATUS_PRIORITY[a.asset.status] ?? 0);
    if (statusDiff !== 0) return statusDiff;
    const idDiff = a.asset.id.localeCompare(b.asset.id);
    if (idDiff !== 0) return idDiff;
    return compareSemverDesc(a.asset.version, b.asset.version);
  });

  return {
    catalogRevision,
    candidate,
    items: items.slice(0, limit),
  };
}
