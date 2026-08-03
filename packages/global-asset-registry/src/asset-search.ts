import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  MIN_SEARCH_LIMIT,
  SCORE_WEIGHTS,
  STATUS_PRIORITY,
  AssetRegistryError,
} from './asset-errors.ts';
import {
  compareSemverDesc,
  normalizeAssetSearchText,
  normalizeSlug,
  tokenizeSearchText,
} from './asset-normalization.ts';
import type {
  AssetCatalogDiagnostic,
  AssetManifestSummary,
  AssetManifestV1,
  AssetSearchInput,
  AssetSearchMatch,
  AssetSearchResult,
  AssetStatus,
} from './asset-types.ts';

function toSummary(manifest: AssetManifestV1, includePropsSchema: boolean): AssetManifestSummary {
  const summary: AssetManifestSummary = {
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
    license: {
      spdx: manifest.license.spdx,
      ...(manifest.license.attribution ? { attribution: manifest.license.attribution } : {}),
    },
  };
  const preview = manifest.previews?.[0];
  if (preview) {
    summary.preview = { type: preview.type, mimeType: preview.mimeType };
  }
  if (includePropsSchema && manifest.propsSchema) {
    summary.propsSchema = manifest.propsSchema;
  }
  return summary;
}

function defaultStatuses(input: AssetSearchInput): AssetStatus[] {
  if (input.statuses?.length) return input.statuses;
  const statuses: AssetStatus[] = ['published', 'staging'];
  if (input.includeDeprecated) statuses.push('deprecated');
  return statuses;
}

function overlaps(haystack: string[], needles: string[]): boolean {
  const set = new Set(haystack);
  return needles.some((needle) => set.has(needle));
}

function scoreManifest(
  manifest: AssetManifestV1,
  query: string,
): { score: number; matchedFields: string[]; matchReasons: string[] } {
  if (!query) {
    return { score: 0, matchedFields: [], matchReasons: [] };
  }

  const tokens = tokenizeSearchText(query);
  const q = normalizeAssetSearchText(query);
  let score = 0;
  const matchedFields: string[] = [];
  const matchReasons: string[] = [];

  const add = (field: string, reason: string, weight: number) => {
    score += weight;
    if (!matchedFields.includes(field)) matchedFields.push(field);
    matchReasons.push(reason);
  };

  const idNorm = normalizeAssetSearchText(manifest.id);
  const nameNorm = normalizeAssetSearchText(manifest.name);
  if (idNorm === q) add('id', 'exact id match', SCORE_WEIGHTS.exactId);
  if (nameNorm === q) add('name', 'exact name match', SCORE_WEIGHTS.exactName);

  const aliases = (manifest.aliases ?? []).map((alias) => normalizeAssetSearchText(alias));
  if (aliases.includes(q)) add('aliases', 'exact alias match', SCORE_WEIGHTS.exactAlias);

  for (const token of tokens) {
    if (idNorm === token || idNorm.startsWith(token) || idNorm.split(/[.\-\s]/).includes(token)) {
      add('id', `id token:${token}`, SCORE_WEIGHTS.idToken);
    }
    if (nameNorm === token || nameNorm.startsWith(`${token} `) || nameNorm.split(' ').includes(token)) {
      add('name', `name token:${token}`, SCORE_WEIGHTS.nameToken);
    }
    if (manifest.capabilities.map(normalizeAssetSearchText).includes(token)) {
      add('capabilities', `capability:${token}`, SCORE_WEIGHTS.capability);
    }
    if (manifest.tags.map(normalizeAssetSearchText).includes(token)) {
      add('tags', `tag:${token}`, SCORE_WEIGHTS.tag);
    }
    if (aliases.some((alias) => alias === token || alias.split(' ').includes(token))) {
      add('aliases', `alias token:${token}`, SCORE_WEIGHTS.aliasToken);
    }
    if (manifest.categories.map(normalizeAssetSearchText).includes(token)) {
      add('categories', `category:${token}`, SCORE_WEIGHTS.category);
    }
    if ((manifest.styleTags ?? []).map(normalizeAssetSearchText).includes(token)) {
      add('styleTags', `styleTag:${token}`, SCORE_WEIGHTS.styleTag);
    }
    if (normalizeAssetSearchText(manifest.description).split(' ').includes(token)) {
      add('description', `description token:${token}`, SCORE_WEIGHTS.descriptionToken);
    }
  }

  return { score, matchedFields, matchReasons };
}

export function searchAssets(
  manifests: AssetManifestV1[],
  input: AssetSearchInput,
  catalogRevision: string,
  diagnostics: AssetCatalogDiagnostic[] = [],
): AssetSearchResult {
  const limitRaw = input.limit ?? DEFAULT_SEARCH_LIMIT;
  if (!Number.isInteger(limitRaw) || limitRaw < MIN_SEARCH_LIMIT || limitRaw > MAX_SEARCH_LIMIT) {
    throw new AssetRegistryError(
      'invalid_limit',
      `limit must be an integer between ${MIN_SEARCH_LIMIT} and ${MAX_SEARCH_LIMIT}`,
      'limit',
    );
  }
  const offset = input.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new AssetRegistryError('invalid_offset', 'offset must be an integer >= 0', 'offset');
  }

  const statuses = new Set(defaultStatuses(input));
  const kinds = input.kinds?.length ? new Set(input.kinds) : null;
  const categories = input.categories?.map(normalizeSlug).filter(Boolean) ?? [];
  const tags = input.tags?.map(normalizeSlug).filter(Boolean) ?? [];
  const capabilities = input.capabilities?.map(normalizeSlug).filter(Boolean) ?? [];
  const implementationTypes = input.implementationTypes?.length
    ? new Set(input.implementationTypes)
    : null;
  const query = typeof input.query === 'string' ? input.query.trim() : '';

  const matches: AssetSearchMatch[] = [];
  for (const manifest of manifests) {
    if (!statuses.has(manifest.status)) continue;
    if (kinds && !kinds.has(manifest.kind)) continue;
    if (implementationTypes && !implementationTypes.has(manifest.implementation.type)) continue;
    if (categories.length && !overlaps(manifest.categories, categories)) continue;
    if (tags.length && !overlaps(manifest.tags, tags)) continue;
    if (capabilities.length && !overlaps(manifest.capabilities, capabilities)) continue;

    const scored = scoreManifest(manifest, query);
    if (query && scored.score <= 0) continue;

    matches.push({
      asset: toSummary(manifest, input.includePropsSchema === true),
      score: scored.score,
      matchedFields: scored.matchedFields,
      matchReasons: scored.matchReasons,
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const statusDiff = (STATUS_PRIORITY[b.asset.status] ?? 0) - (STATUS_PRIORITY[a.asset.status] ?? 0);
    if (statusDiff !== 0) return statusDiff;
    const idDiff = a.asset.id.localeCompare(b.asset.id);
    if (idDiff !== 0) return idDiff;
    return compareSemverDesc(a.asset.version, b.asset.version);
  });

  return {
    catalogRevision,
    total: matches.length,
    offset,
    limit: limitRaw,
    items: matches.slice(offset, offset + limitRaw),
    diagnostics,
  };
}
