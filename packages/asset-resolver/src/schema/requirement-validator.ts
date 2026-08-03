import {
  ASSET_IMPLEMENTATION_TYPES,
  ASSET_KINDS,
  ASSET_STATUSES,
  type AssetImplementationType,
  type AssetKind,
  type AssetStatus,
} from '../../../global-asset-registry/src/asset-types.ts';
import {
  uniqueNormalizedSlugs,
} from '../../../global-asset-registry/src/asset-normalization.ts';
import type { AssetRequirementV1, AssetCompositionPartRequirementV1 } from '../contracts/asset-requirement.ts';
import {
  ASSET_REQUIREMENT_LIMITS,
  ASSET_REQUIREMENT_SCHEMA_VERSION,
  type AssetRequirementSetV1,
} from '../contracts/asset-requirement-set.ts';
import {
  DEFAULT_RESOLUTION_POLICY,
  type AssetResolutionPolicyV1,
} from '../contracts/resolution-policy.ts';
import { REQUIREMENT_ID_PATTERN, REQUIREMENT_SET_ID_PATTERN } from '../contracts/asset-requirement.ts';
import type { AssetResolverDiagnostic } from '../contracts/resolver-errors.ts';
import { diagnostic } from '../contracts/resolver-errors.ts';
import { deepCloneJson, isJsonSerializable, stableStringify } from './requirement-serialization.ts';
import { computeAssetRequirementSetHash } from './requirement-hash.ts';

export type AssetRequirementValidationResult = {
  valid: boolean;
  normalizedRequirementSet?: AssetRequirementSetV1;
  requirementSetHash?: string;
  errors: AssetResolverDiagnostic[];
  warnings: AssetResolverDiagnostic[];
};

const PRIORITIES = new Set(['critical', 'high', 'normal', 'low']);
const MODES = new Set(['direct', 'direct-or-composition', 'composition']);
const FIT = new Set(['contain', 'cover', 'stretch']);
const LAYOUTS = new Set(['overlay', 'row', 'column', 'labelled', 'radial', 'custom']);
const REUSE_PREFS = new Set(['none', 'balanced', 'strong']);
const KIND_SET = new Set<string>(ASSET_KINDS);
const STATUS_SET = new Set<string>(ASSET_STATUSES);
const IMPL_SET = new Set<string>(ASSET_IMPLEMENTATION_TYPES);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeMetadataList(values: unknown, field: string, errors: AssetResolverDiagnostic[], path: string): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', `${field} must be an array`, { path }));
    return [];
  }
  if (values.length > ASSET_REQUIREMENT_LIMITS.MAX_METADATA_VALUES_PER_FIELD) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', `${field} exceeds ${ASSET_REQUIREMENT_LIMITS.MAX_METADATA_VALUES_PER_FIELD} values`, { path }));
  }
  return sortUnique(uniqueNormalizedSlugs(values));
}

function normalizeAssetIdList(values: unknown, field: string, errors: AssetResolverDiagnostic[], path: string): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', `${field} must be an array`, { path }));
    return [];
  }
  if (values.length > ASSET_REQUIREMENT_LIMITS.MAX_METADATA_VALUES_PER_FIELD) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', `${field} exceeds ${ASSET_REQUIREMENT_LIMITS.MAX_METADATA_VALUES_PER_FIELD} values`, { path }));
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!id || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Invalid asset id "${String(value)}" in ${field}`, { path }));
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function normalizePolicy(
  partial: unknown,
  path: string,
  errors: AssetResolverDiagnostic[],
): Partial<AssetResolutionPolicyV1> | undefined {
  if (partial === undefined) return undefined;
  if (!isPlainObject(partial)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', 'policy must be an object', { path }));
    return undefined;
  }
  const known = new Set(Object.keys(DEFAULT_RESOLUTION_POLICY));
  for (const key of Object.keys(partial)) {
    if (!known.has(key)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', `Unknown policy field "${key}"`, { path: `${path}.${key}` }));
    }
  }
  const out: Partial<AssetResolutionPolicyV1> = {};
  if (partial.allowedStatuses !== undefined) {
    if (!Array.isArray(partial.allowedStatuses) || !partial.allowedStatuses.every((s) => typeof s === 'string' && STATUS_SET.has(s))) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', 'allowedStatuses must be known statuses', { path: `${path}.allowedStatuses` }));
    } else if ((partial.allowedStatuses as string[]).includes('draft')) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', 'draft is never allowed in allowedStatuses', { path: `${path}.allowedStatuses` }));
    } else {
      out.allowedStatuses = sortUnique(partial.allowedStatuses as string[]) as AssetStatus[];
    }
  }
  for (const boolKey of [
    'requireRuntime', 'allowVariant', 'allowComposition', 'allowCreationBrief',
    'allowDeprecatedExactPin', 'includeCandidates', 'includeRejectedCandidates',
  ] as const) {
    if (partial[boolKey] !== undefined) {
      if (typeof partial[boolKey] !== 'boolean') {
        errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', `${boolKey} must be boolean`, { path: `${path}.${boolKey}` }));
      } else {
        out[boolKey] = partial[boolKey] as boolean;
      }
    }
  }
  for (const numKey of ['minimumScore', 'directPreferenceThreshold'] as const) {
    if (partial[numKey] !== undefined) {
      const n = partial[numKey];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) {
        errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', `${numKey} must be in 0..1`, { path: `${path}.${numKey}` }));
      } else out[numKey] = n;
    }
  }
  if (partial.candidateLimit !== undefined) {
    const n = partial.candidateLimit;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 20) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', 'candidateLimit must be 1..20', { path: `${path}.candidateLimit` }));
    } else out.candidateLimit = n;
  }
  if (partial.rejectedCandidateLimit !== undefined) {
    const n = partial.rejectedCandidateLimit;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 20) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', 'rejectedCandidateLimit must be 0..20', { path: `${path}.rejectedCandidateLimit` }));
    } else out.rejectedCandidateLimit = n;
  }
  if (partial.maximumCompositionParts !== undefined) {
    const n = partial.maximumCompositionParts;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > ASSET_REQUIREMENT_LIMITS.MAX_COMPOSITION_PARTS) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', `maximumCompositionParts must be 1..${ASSET_REQUIREMENT_LIMITS.MAX_COMPOSITION_PARTS}`, { path: `${path}.maximumCompositionParts` }));
    } else out.maximumCompositionParts = n;
  }
  if (partial.reusePreference !== undefined) {
    if (typeof partial.reusePreference !== 'string' || !REUSE_PREFS.has(partial.reusePreference)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', 'reusePreference invalid', { path: `${path}.reusePreference` }));
    } else out.reusePreference = partial.reusePreference as AssetResolutionPolicyV1['reusePreference'];
  }
  return out;
}

function normalizeExactAsset(
  value: unknown,
  path: string,
  errors: AssetResolverDiagnostic[],
): { id: string; version: string } | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value) || typeof value.id !== 'string' || typeof value.version !== 'string') {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'exactAsset must have id and version strings', { path }));
    return undefined;
  }
  const id = value.id.trim();
  const version = value.version.trim();
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Invalid asset id "${id}"`, { path: `${path}.id` }));
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Invalid asset version "${version}"`, { path: `${path}.version` }));
  }
  const allowed = new Set(['id', 'version']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Unknown exactAsset field "${key}"`, { path: `${path}.${key}` }));
    }
  }
  return { id, version };
}

function normalizePart(
  raw: unknown,
  path: string,
  errors: AssetResolverDiagnostic[],
): AssetCompositionPartRequirementV1 | null {
  if (!isPlainObject(raw)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'composition part must be an object', { path }));
    return null;
  }
  const allowedKeys = new Set([
    'id', 'role', 'required', 'search', 'kinds', 'requiredCapabilities', 'preferredCapabilities',
    'categories', 'tags', 'styleTags', 'implementationTypes', 'preferredAssetIds', 'blockedAssetIds',
    'exactAsset', 'desiredProps', 'fitHint', 'order', 'parentPartId', 'normalizedBox',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Unknown composition part field "${key}"`, { path: `${path}.${key}` }));
    }
  }
  if (typeof raw.id !== 'string' || !REQUIREMENT_ID_PATTERN.test(raw.id)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_DUPLICATE_ID', 'Invalid composition part id', { path: `${path}.id` }));
  }
  if (typeof raw.role !== 'string' || !raw.role.trim()) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'composition part role required', { path: `${path}.role` }));
  }
  if (!isPlainObject(raw.search) || !Array.isArray((raw.search as Record<string, unknown>).queries)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'composition part search.queries required', { path: `${path}.search` }));
  }
  const partSearch = isPlainObject(raw.search) ? raw.search as Record<string, unknown> : {};
  const queries = Array.isArray(partSearch.queries)
    ? (partSearch.queries as unknown[]).filter((q): q is string => typeof q === 'string').map((q) => q.trim())
    : [];
  if (queries.length > ASSET_REQUIREMENT_LIMITS.MAX_QUERIES_PER_REQUIREMENT) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'too many queries on part', { path: `${path}.search.queries` }));
  }
  for (const [i, q] of queries.entries()) {
    if (!q || q.length > ASSET_REQUIREMENT_LIMITS.MAX_QUERY_LENGTH) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Invalid query at index ${i}`, { path: `${path}.search.queries.${i}` }));
    }
  }
  const exactAsset = normalizeExactAsset(raw.exactAsset, `${path}.exactAsset`, errors);
  if (!queries.length && !exactAsset) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'part needs search queries or exactAsset', { path: `${path}.search` }));
  }
  if (raw.desiredProps !== undefined) {
    if (!isPlainObject(raw.desiredProps) || !isJsonSerializable(raw.desiredProps)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_PROPS', 'desiredProps must be JSON-serializable plain object', { path: `${path}.desiredProps` }));
    }
  }
  let normalizedBox: AssetCompositionPartRequirementV1['normalizedBox'];
  if (raw.normalizedBox !== undefined) {
    if (!isPlainObject(raw.normalizedBox)) {
      errors.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_INVALID_LAYOUT', 'normalizedBox must be object', { path: `${path}.normalizedBox` }));
    } else {
      const { x, y, width, height } = raw.normalizedBox as Record<string, unknown>;
      if ([x, y, width, height].some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
        errors.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_INVALID_LAYOUT', 'normalizedBox fields must be finite numbers', { path: `${path}.normalizedBox` }));
      } else if (
        (x as number) < 0 || (y as number) < 0 || (width as number) <= 0 || (height as number) <= 0
        || (x as number) + (width as number) > 1 + 1e-9
        || (y as number) + (height as number) > 1 + 1e-9
      ) {
        errors.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_INVALID_LAYOUT', 'normalizedBox must fit in 0..1 canvas', { path: `${path}.normalizedBox` }));
      } else {
        normalizedBox = { x: x as number, y: y as number, width: width as number, height: height as number };
      }
    }
  }

  const preferredAssetIds = normalizeAssetIdList(raw.preferredAssetIds, 'preferredAssetIds', errors, `${path}.preferredAssetIds`);
  const blockedAssetIds = normalizeAssetIdList(raw.blockedAssetIds, 'blockedAssetIds', errors, `${path}.blockedAssetIds`);
  if (preferredAssetIds.some((id) => blockedAssetIds.includes(id))) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_EXACT_PIN_CONFLICT', 'preferredAssetIds intersects blockedAssetIds', { path }));
  }
  if (exactAsset && blockedAssetIds.includes(exactAsset.id)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_EXACT_PIN_CONFLICT', 'exactAsset is blocked', { path: `${path}.exactAsset` }));
  }

  const kindsRaw = isPlainObject(raw.kinds) ? raw.kinds as Record<string, unknown> : {};
  const kindsAllowed = Array.isArray(kindsRaw.allowed)
    ? (kindsRaw.allowed as unknown[]).filter((k): k is AssetKind => typeof k === 'string' && KIND_SET.has(k))
    : undefined;
  const kindsPreferred = Array.isArray(kindsRaw.preferred)
    ? (kindsRaw.preferred as unknown[]).filter((k): k is AssetKind => typeof k === 'string' && KIND_SET.has(k))
    : undefined;

  const part: AssetCompositionPartRequirementV1 = {
    id: String(raw.id ?? ''),
    role: typeof raw.role === 'string' ? raw.role.trim() : '',
    search: {
      queries,
      ...(Array.isArray(partSearch.aliases)
        ? { aliases: sortUnique((partSearch.aliases as unknown[]).filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean)) }
        : {}),
    },
  };
  if (raw.required !== undefined) part.required = Boolean(raw.required);
  if (kindsAllowed || kindsPreferred) {
    part.kinds = {
      ...(kindsAllowed ? { allowed: sortUnique(kindsAllowed) as AssetKind[] } : {}),
      ...(kindsPreferred ? { preferred: sortUnique(kindsPreferred) as AssetKind[] } : {}),
    };
  }
  const reqCaps = normalizeMetadataList(raw.requiredCapabilities, 'requiredCapabilities', errors, `${path}.requiredCapabilities`);
  if (reqCaps.length) part.requiredCapabilities = reqCaps;
  const prefCaps = normalizeMetadataList(raw.preferredCapabilities, 'preferredCapabilities', errors, `${path}.preferredCapabilities`);
  if (prefCaps.length) part.preferredCapabilities = prefCaps;
  const categories = normalizeMetadataList(raw.categories, 'categories', errors, `${path}.categories`);
  if (categories.length) part.categories = categories;
  const tags = normalizeMetadataList(raw.tags, 'tags', errors, `${path}.tags`);
  if (tags.length) part.tags = tags;
  const styleTags = normalizeMetadataList(raw.styleTags, 'styleTags', errors, `${path}.styleTags`);
  if (styleTags.length) part.styleTags = styleTags;
  if (Array.isArray(raw.implementationTypes)) {
    part.implementationTypes = sortUnique(
      (raw.implementationTypes as unknown[])
        .filter((t): t is AssetImplementationType => typeof t === 'string' && IMPL_SET.has(t)),
    ) as AssetImplementationType[];
  }
  if (preferredAssetIds.length) part.preferredAssetIds = preferredAssetIds;
  if (blockedAssetIds.length) part.blockedAssetIds = blockedAssetIds;
  if (exactAsset) part.exactAsset = exactAsset;
  if (raw.desiredProps && isPlainObject(raw.desiredProps) && isJsonSerializable(raw.desiredProps)) {
    part.desiredProps = deepCloneJson(raw.desiredProps);
  }
  if (typeof raw.fitHint === 'string' && FIT.has(raw.fitHint)) part.fitHint = raw.fitHint as AssetCompositionPartRequirementV1['fitHint'];
  if (typeof raw.order === 'number' && Number.isInteger(raw.order)) part.order = raw.order;
  if (typeof raw.parentPartId === 'string' && raw.parentPartId.trim()) part.parentPartId = raw.parentPartId.trim();
  if (normalizedBox) part.normalizedBox = normalizedBox;
  return part;
}

function normalizeRequirement(
  raw: unknown,
  path: string,
  errors: AssetResolverDiagnostic[],
): AssetRequirementV1 | null {
  if (!isPlainObject(raw)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'requirement must be an object', { path }));
    return null;
  }
  const allowedKeys = new Set([
    'id', 'scope', 'name', 'description', 'optional', 'priority', 'mode', 'search', 'kinds',
    'requiredCapabilities', 'preferredCapabilities', 'categories', 'tags', 'styleTags',
    'implementationTypes', 'preferredAssetIds', 'blockedAssetIds', 'exactAsset', 'desiredProps',
    'fitHint', 'reuseKey', 'distinctKey', 'policy', 'composition',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Unknown requirement field "${key}"`, { path: `${path}.${key}` }));
    }
  }
  if (typeof raw.id !== 'string' || !REQUIREMENT_ID_PATTERN.test(raw.id)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_DUPLICATE_ID', 'Invalid requirement id', { path: `${path}.id` }));
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'name required', { path: `${path}.name` }));
  }
  if (typeof raw.description !== 'string' || !raw.description.trim()) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'description required', { path: `${path}.description` }));
  }
  if (!isPlainObject(raw.search) || !Array.isArray((raw.search as Record<string, unknown>).queries)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'search.queries required', { path: `${path}.search` }));
  }
  const reqSearch = isPlainObject(raw.search) ? raw.search as Record<string, unknown> : {};
  const queries = Array.isArray(reqSearch.queries)
    ? (reqSearch.queries as unknown[]).filter((q): q is string => typeof q === 'string').map((q) => q.trim())
    : [];
  if (queries.length > ASSET_REQUIREMENT_LIMITS.MAX_QUERIES_PER_REQUIREMENT) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'too many queries', { path: `${path}.search.queries` }));
  }
  for (const [i, q] of queries.entries()) {
    if (!q || q.length > ASSET_REQUIREMENT_LIMITS.MAX_QUERY_LENGTH) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Invalid query at index ${i}`, { path: `${path}.search.queries.${i}` }));
    }
  }
  const exactAsset = normalizeExactAsset(raw.exactAsset, `${path}.exactAsset`, errors);
  if (!queries.length && !exactAsset) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'requirement needs search queries or exactAsset', { path: `${path}.search` }));
  }
  const mode = typeof raw.mode === 'string' && MODES.has(raw.mode) ? raw.mode as AssetRequirementV1['mode'] : 'direct';
  if (raw.mode !== undefined && (typeof raw.mode !== 'string' || !MODES.has(raw.mode))) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'invalid mode', { path: `${path}.mode` }));
  }
  if (raw.desiredProps !== undefined && (!isPlainObject(raw.desiredProps) || !isJsonSerializable(raw.desiredProps))) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_PROPS', 'desiredProps must be JSON-serializable plain object', { path: `${path}.desiredProps` }));
  }

  let composition: AssetRequirementV1['composition'];
  if (raw.composition !== undefined) {
    if (!isPlainObject(raw.composition) || !Array.isArray(raw.composition.parts)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'composition must have parts array', { path: `${path}.composition` }));
    } else {
      if (typeof raw.composition.layoutHint !== 'string' || !LAYOUTS.has(raw.composition.layoutHint)) {
        errors.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_INVALID_LAYOUT', 'invalid layoutHint', { path: `${path}.composition.layoutHint` }));
      }
      if (raw.composition.parts.length > ASSET_REQUIREMENT_LIMITS.MAX_COMPOSITION_PARTS) {
        errors.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_TOO_COMPLEX', 'too many composition parts', { path: `${path}.composition.parts` }));
      }
      const parts: AssetCompositionPartRequirementV1[] = [];
      const partIds = new Set<string>();
      for (const [i, partRaw] of (raw.composition.parts as unknown[]).entries()) {
        const part = normalizePart(partRaw, `${path}.composition.parts.${i}`, errors);
        if (!part) continue;
        if (partIds.has(part.id)) {
          errors.push(diagnostic('error', 'ASSET_REQUIREMENT_DUPLICATE_ID', `Duplicate part id "${part.id}"`, { path: `${path}.composition.parts.${i}.id` }));
        }
        partIds.add(part.id);
        parts.push(part);
      }
      for (const part of parts) {
        if (part.parentPartId && !partIds.has(part.parentPartId)) {
          errors.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_INVALID_LAYOUT', `parentPartId "${part.parentPartId}" missing`, {
            path: `${path}.composition`,
            partId: part.id,
          }));
        }
      }
      // Cycle check
      const visiting = new Set<string>();
      const visited = new Set<string>();
      const byId = new Map(parts.map((p) => [p.id, p]));
      const hasCycle = (id: string): boolean => {
        if (visited.has(id)) return false;
        if (visiting.has(id)) return true;
        visiting.add(id);
        const parent = byId.get(id)?.parentPartId;
        if (parent && hasCycle(parent)) return true;
        visiting.delete(id);
        visited.add(id);
        return false;
      };
      for (const part of parts) {
        if (hasCycle(part.id)) {
          errors.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_INVALID_LAYOUT', 'composition parent cycle detected', { path: `${path}.composition` }));
          break;
        }
      }
      if (raw.composition.layoutHint === 'custom' && parts.some((p) => !p.normalizedBox)) {
        errors.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_INVALID_LAYOUT', 'custom layout requires normalizedBox on every part', { path: `${path}.composition` }));
      }
      composition = {
        layoutHint: (typeof raw.composition.layoutHint === 'string' && LAYOUTS.has(raw.composition.layoutHint)
          ? raw.composition.layoutHint
          : 'overlay') as NonNullable<AssetRequirementV1['composition']>['layoutHint'],
        parts,
      };
    }
  }
  if (mode === 'composition' && !composition) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'mode composition requires composition', { path: `${path}.composition` }));
  }
  if (mode === 'direct' && composition) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'mode direct cannot include composition', { path: `${path}.composition` }));
  }

  const preferredAssetIds = normalizeAssetIdList(raw.preferredAssetIds, 'preferredAssetIds', errors, `${path}.preferredAssetIds`);
  const blockedAssetIds = normalizeAssetIdList(raw.blockedAssetIds, 'blockedAssetIds', errors, `${path}.blockedAssetIds`);
  if (preferredAssetIds.some((id) => blockedAssetIds.includes(id))) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_EXACT_PIN_CONFLICT', 'preferredAssetIds intersects blockedAssetIds', { path }));
  }
  if (exactAsset && blockedAssetIds.includes(exactAsset.id)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_EXACT_PIN_CONFLICT', 'exactAsset is blocked', { path: `${path}.exactAsset` }));
  }

  const req: AssetRequirementV1 = {
    id: String(raw.id ?? ''),
    name: typeof raw.name === 'string' ? raw.name.trim() : '',
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    search: {
      queries,
      ...(Array.isArray(reqSearch.aliases)
        ? { aliases: sortUnique((reqSearch.aliases as unknown[]).filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean)) }
        : {}),
    },
  };
  if (isPlainObject(raw.scope)) {
    const scope: NonNullable<AssetRequirementV1['scope']> = {};
    if (typeof raw.scope.sceneId === 'string') scope.sceneId = raw.scope.sceneId.trim();
    if (typeof raw.scope.beatId === 'string') scope.beatId = raw.scope.beatId.trim();
    if (typeof raw.scope.shotId === 'string') scope.shotId = raw.scope.shotId.trim();
    if (Object.keys(scope).length) req.scope = scope;
  }
  if (raw.optional === true) req.optional = true;
  if (typeof raw.priority === 'string' && PRIORITIES.has(raw.priority)) {
    req.priority = raw.priority as AssetRequirementV1['priority'];
  } else if (raw.priority !== undefined) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_POLICY', 'invalid priority', { path: `${path}.priority` }));
  }
  if (mode !== 'direct') req.mode = mode;
  const reqKinds = isPlainObject(raw.kinds) ? raw.kinds as Record<string, unknown> : {};
  const kindsAllowed = Array.isArray(reqKinds.allowed)
    ? (reqKinds.allowed as unknown[]).filter((k): k is AssetKind => typeof k === 'string' && KIND_SET.has(k))
    : undefined;
  const kindsPreferred = Array.isArray(reqKinds.preferred)
    ? (reqKinds.preferred as unknown[]).filter((k): k is AssetKind => typeof k === 'string' && KIND_SET.has(k))
    : undefined;
  if (kindsAllowed || kindsPreferred) {
    req.kinds = {
      ...(kindsAllowed ? { allowed: sortUnique(kindsAllowed) as AssetKind[] } : {}),
      ...(kindsPreferred ? { preferred: sortUnique(kindsPreferred) as AssetKind[] } : {}),
    };
  }
  const reqCaps = normalizeMetadataList(raw.requiredCapabilities, 'requiredCapabilities', errors, `${path}.requiredCapabilities`);
  if (reqCaps.length) req.requiredCapabilities = reqCaps;
  const prefCaps = normalizeMetadataList(raw.preferredCapabilities, 'preferredCapabilities', errors, `${path}.preferredCapabilities`);
  if (prefCaps.length) req.preferredCapabilities = prefCaps;
  const categories = normalizeMetadataList(raw.categories, 'categories', errors, `${path}.categories`);
  if (categories.length) req.categories = categories;
  const tags = normalizeMetadataList(raw.tags, 'tags', errors, `${path}.tags`);
  if (tags.length) req.tags = tags;
  const styleTags = normalizeMetadataList(raw.styleTags, 'styleTags', errors, `${path}.styleTags`);
  if (styleTags.length) req.styleTags = styleTags;
  if (Array.isArray(raw.implementationTypes)) {
    req.implementationTypes = sortUnique(
      (raw.implementationTypes as unknown[])
        .filter((t): t is AssetImplementationType => typeof t === 'string' && IMPL_SET.has(t)),
    ) as AssetImplementationType[];
  }
  if (preferredAssetIds.length) req.preferredAssetIds = preferredAssetIds;
  if (blockedAssetIds.length) req.blockedAssetIds = blockedAssetIds;
  if (exactAsset) req.exactAsset = exactAsset;
  if (raw.desiredProps && isPlainObject(raw.desiredProps) && isJsonSerializable(raw.desiredProps)) {
    req.desiredProps = deepCloneJson(raw.desiredProps);
  }
  if (typeof raw.fitHint === 'string' && FIT.has(raw.fitHint)) req.fitHint = raw.fitHint as AssetRequirementV1['fitHint'];
  if (typeof raw.reuseKey === 'string' && raw.reuseKey.trim()) req.reuseKey = raw.reuseKey.trim();
  if (typeof raw.distinctKey === 'string' && raw.distinctKey.trim()) req.distinctKey = raw.distinctKey.trim();
  const policy = normalizePolicy(raw.policy, `${path}.policy`, errors);
  if (policy && Object.keys(policy).length) req.policy = policy;
  if (composition) req.composition = composition;
  return req;
}

export function validateAndNormalizeRequirementSet(input: unknown): AssetRequirementValidationResult {
  const errors: AssetResolverDiagnostic[] = [];
  const warnings: AssetResolverDiagnostic[] = [];

  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return {
      valid: false,
      errors: [diagnostic('error', 'ASSET_REQUIREMENT_INVALID_PROPS', 'Requirement set is not JSON-serializable', {
        recovery: 'Remove circular refs, BigInt, functions, NaN, or Infinity',
      })],
      warnings,
    };
  }
  if (Buffer.byteLength(serialized, 'utf8') > ASSET_REQUIREMENT_LIMITS.MAX_SERIALIZED_BYTES) {
    return {
      valid: false,
      errors: [diagnostic('error', 'ASSET_REQUIREMENT_SET_TOO_LARGE', `Requirement set exceeds ${ASSET_REQUIREMENT_LIMITS.MAX_SERIALIZED_BYTES} bytes`, {
        recovery: 'Split into smaller requirement sets',
      })],
      warnings,
    };
  }
  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: [diagnostic('error', 'ASSET_REQUIREMENT_SCHEMA_UNSUPPORTED', 'Requirement set must be an object')],
      warnings,
    };
  }
  if (input.schemaVersion !== ASSET_REQUIREMENT_SCHEMA_VERSION) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion "${String(input.schemaVersion)}"`, {
      path: 'schemaVersion',
      recovery: `Use "${ASSET_REQUIREMENT_SCHEMA_VERSION}"`,
    }));
  }
  const allowedRoot = new Set(['schemaVersion', 'id', 'name', 'description', 'theme', 'defaultPolicy', 'requirements']);
  for (const key of Object.keys(input)) {
    if (!allowedRoot.has(key)) {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', `Unknown field "${key}"`, { path: key }));
    }
  }
  if (typeof input.id !== 'string' || !REQUIREMENT_SET_ID_PATTERN.test(input.id)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_DUPLICATE_ID', 'Invalid requirement set id', { path: 'id' }));
  }
  if (!Array.isArray(input.requirements)) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'requirements must be an array', { path: 'requirements' }));
  } else if (input.requirements.length > ASSET_REQUIREMENT_LIMITS.MAX_REQUIREMENTS) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_TOO_MANY_ITEMS', `At most ${ASSET_REQUIREMENT_LIMITS.MAX_REQUIREMENTS} requirements`, { path: 'requirements' }));
  } else if (input.requirements.length === 0) {
    errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'requirements must not be empty', { path: 'requirements' }));
  }

  const defaultPolicy = normalizePolicy(input.defaultPolicy, 'defaultPolicy', errors);
  let theme: AssetRequirementSetV1['theme'];
  if (input.theme !== undefined) {
    if (!isPlainObject(input.theme) || typeof input.theme.id !== 'string' || typeof input.theme.version !== 'string') {
      errors.push(diagnostic('error', 'ASSET_REQUIREMENT_INVALID_QUERY', 'theme must have id and version', { path: 'theme' }));
    } else {
      theme = { id: input.theme.id.trim(), version: input.theme.version.trim() };
    }
  }

  const requirements: AssetRequirementV1[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(input.requirements)) {
    for (const [i, raw] of input.requirements.entries()) {
      const req = normalizeRequirement(raw, `requirements.${i}`, errors);
      if (!req) continue;
      if (seenIds.has(req.id)) {
        errors.push(diagnostic('error', 'ASSET_REQUIREMENT_DUPLICATE_ID', `Duplicate requirement id "${req.id}"`, {
          path: `requirements.${i}.id`,
          requirementId: req.id,
        }));
      }
      seenIds.add(req.id);
      requirements.push(req);
    }
  }

  if (errors.length) {
    return { valid: false, errors, warnings };
  }

  const normalized: AssetRequirementSetV1 = {
    schemaVersion: ASSET_REQUIREMENT_SCHEMA_VERSION,
    id: String(input.id),
    requirements,
  };
  if (typeof input.name === 'string' && input.name.trim()) normalized.name = input.name.trim();
  if (typeof input.description === 'string' && input.description.trim()) normalized.description = input.description.trim();
  if (theme) normalized.theme = theme;
  if (defaultPolicy && Object.keys(defaultPolicy).length) normalized.defaultPolicy = defaultPolicy;

  return {
    valid: true,
    normalizedRequirementSet: normalized,
    requirementSetHash: computeAssetRequirementSetHash(normalized),
    errors,
    warnings,
  };
}

export function mergePolicy(
  defaults: Partial<AssetResolutionPolicyV1> | undefined,
  override: Partial<AssetResolutionPolicyV1> | undefined,
  callOverrides?: Partial<AssetResolutionPolicyV1>,
): AssetResolutionPolicyV1 {
  return {
    ...DEFAULT_RESOLUTION_POLICY,
    ...defaults,
    ...override,
    ...callOverrides,
  };
}

export { stableStringify };
