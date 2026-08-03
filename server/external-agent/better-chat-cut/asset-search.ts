import {
  AssetRegistryError,
  computeAssetContentHash,
  createAssetCatalogWriter,
  createGlobalAssetRegistry,
  findSimilarAssets,
  resolveAssetCatalogRootDescriptors,
  validateAssetManifest,
  type AssetSearchInput,
  type AssetSearchResult,
  type AssetStatus,
  type GlobalAssetRegistry,
} from '../../../packages/global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../packages/global-asset-registry/src/asset-registry.ts';
import {
  ASSET_IMPLEMENTATION_TYPES,
  ASSET_KINDS,
  ASSET_STATUSES,
} from '../../../packages/global-asset-registry/src/asset-types.ts';
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  MIN_SEARCH_LIMIT,
} from '../../../packages/global-asset-registry/src/asset-errors.ts';

let registryPromise: Promise<GlobalAssetRegistryWithRecords> | null = null;

async function getRegistry(): Promise<GlobalAssetRegistryWithRecords> {
  if (!registryPromise) {
    registryPromise = (async () => {
      const registry = createGlobalAssetRegistry({
        roots: resolveAssetCatalogRootDescriptors(),
        strict: false,
      });
      await registry.refresh();
      return registry;
    })();
  }
  return registryPromise;
}

export async function resetBetterChatCutAssetRegistryForTests(
  roots: Array<string | { path: string; scope?: 'bundled' | 'user'; writable?: boolean }>,
): Promise<GlobalAssetRegistryWithRecords> {
  const registry = createGlobalAssetRegistry({ roots, strict: false });
  await registry.refresh();
  registryPromise = Promise.resolve(registry);
  return registry;
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const CATALOG_TOOLS = [
  {
    name: 'asset_search',
    description:
      'Search the Better Chat Cut shared asset catalog before creating new visual assets or motion components. Returns reusable assets ranked by metadata relevance and filtered by kind, category, capability, implementation type, and lifecycle status. This tool is read-only and does not modify projects or catalog files.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        kinds: { type: 'array', items: { type: 'string', enum: [...ASSET_KINDS] } },
        categories: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        capabilities: { type: 'array', items: { type: 'string' } },
        implementationTypes: { type: 'array', items: { type: 'string', enum: [...ASSET_IMPLEMENTATION_TYPES] } },
        statuses: { type: 'array', items: { type: 'string', enum: [...ASSET_STATUSES] } },
        includeDeprecated: { type: 'boolean' },
        includePropsSchema: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        offset: { type: 'integer', minimum: 0 },
      },
    },
    annotations: readOnlyAnnotations,
  },
  {
    name: 'asset_get',
    description: 'Get one Better Chat Cut catalog asset by id (and optional version). Read-only; does not require an edit session.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string' },
        version: { type: 'string' },
      },
    },
    annotations: readOnlyAnnotations,
  },
  {
    name: 'asset_validate_manifest',
    description: 'Validate a candidate Asset Manifest v1 without writing files.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['manifest'],
      properties: {
        manifest: { type: 'object' },
        targetStage: { type: 'string', enum: ['draft', 'staging', 'published'] },
      },
    },
    annotations: readOnlyAnnotations,
  },
  {
    name: 'asset_find_similar',
    description: 'Find similar catalog assets before creating a new one. Call this before asset_create_draft.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['candidate'],
      properties: {
        candidate: { type: 'object' },
        statuses: { type: 'array', items: { type: 'string', enum: [...ASSET_STATUSES] } },
        limit: { type: 'integer', minimum: 1, maximum: 30 },
      },
    },
    annotations: readOnlyAnnotations,
  },
  {
    name: 'asset_create_draft',
    description: 'Create a new draft asset in the user catalog. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'expectedCatalogRevision', 'manifest'],
      properties: {
        requestId: { type: 'string' },
        expectedCatalogRevision: { type: 'string' },
        manifest: { type: 'object' },
        basedOn: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'string' }, version: { type: 'string' } },
          required: ['id', 'version'],
        },
        duplicateOverride: {
          type: 'object',
          additionalProperties: false,
          properties: { reason: { type: 'string' } },
          required: ['reason'],
        },
        dryRun: { type: 'boolean' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'asset_update_draft',
    description: 'Replace a user-writable draft asset manifest. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'expectedCatalogRevision', 'expectedContentHash', 'manifest'],
      properties: {
        requestId: { type: 'string' },
        expectedCatalogRevision: { type: 'string' },
        expectedContentHash: { type: 'string' },
        manifest: { type: 'object' },
        duplicateOverride: {
          type: 'object',
          additionalProperties: false,
          properties: { reason: { type: 'string' } },
          required: ['reason'],
        },
        dryRun: { type: 'boolean' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'asset_transition_status',
    description: 'Transition a user-writable asset through draft↔staging→published→deprecated. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'expectedCatalogRevision', 'expectedContentHash', 'id', 'version', 'targetStatus'],
      properties: {
        requestId: { type: 'string' },
        expectedCatalogRevision: { type: 'string' },
        expectedContentHash: { type: 'string' },
        id: { type: 'string' },
        version: { type: 'string' },
        targetStatus: { type: 'string', enum: [...ASSET_STATUSES] },
        deprecation: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reason: { type: 'string' },
            replacementAssetId: { type: 'string' },
            replacementAssetVersion: { type: 'string' },
          },
          required: ['reason'],
        },
        dryRun: { type: 'boolean' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
] as const;

export const ASSET_SEARCH_TOOL = CATALOG_TOOLS[0];

function asStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new AssetRegistryError('invalid_type', `${field} must be an array of strings`, field);
  }
  return value;
}

export function parseAssetSearchInput(args: Record<string, unknown>): AssetSearchInput {
  const input: AssetSearchInput = {};
  if (args.query !== undefined) {
    if (typeof args.query !== 'string') throw new AssetRegistryError('invalid_type', 'query must be a string', 'query');
    input.query = args.query;
  }
  if (args.kinds !== undefined) input.kinds = asStringArray(args.kinds, 'kinds') as AssetSearchInput['kinds'];
  if (args.categories !== undefined) input.categories = asStringArray(args.categories, 'categories');
  if (args.tags !== undefined) input.tags = asStringArray(args.tags, 'tags');
  if (args.capabilities !== undefined) input.capabilities = asStringArray(args.capabilities, 'capabilities');
  if (args.implementationTypes !== undefined) {
    input.implementationTypes = asStringArray(args.implementationTypes, 'implementationTypes') as AssetSearchInput['implementationTypes'];
  }
  if (args.statuses !== undefined) input.statuses = asStringArray(args.statuses, 'statuses') as AssetSearchInput['statuses'];
  if (args.includeDeprecated !== undefined) {
    if (typeof args.includeDeprecated !== 'boolean') {
      throw new AssetRegistryError('invalid_type', 'includeDeprecated must be a boolean', 'includeDeprecated');
    }
    input.includeDeprecated = args.includeDeprecated;
  }
  if (args.includePropsSchema !== undefined) {
    if (typeof args.includePropsSchema !== 'boolean') {
      throw new AssetRegistryError('invalid_type', 'includePropsSchema must be a boolean', 'includePropsSchema');
    }
    input.includePropsSchema = args.includePropsSchema;
  }
  if (args.limit !== undefined) {
    if (typeof args.limit !== 'number' || !Number.isInteger(args.limit) || args.limit < MIN_SEARCH_LIMIT || args.limit > MAX_SEARCH_LIMIT) {
      throw new AssetRegistryError('invalid_limit', `limit must be an integer between ${MIN_SEARCH_LIMIT} and ${MAX_SEARCH_LIMIT}`, 'limit');
    }
    input.limit = args.limit;
  } else {
    input.limit = DEFAULT_SEARCH_LIMIT;
  }
  if (args.offset !== undefined) {
    if (typeof args.offset !== 'number' || !Number.isInteger(args.offset) || args.offset < 0) {
      throw new AssetRegistryError('invalid_offset', 'offset must be an integer >= 0', 'offset');
    }
    input.offset = args.offset;
  }
  return input;
}

export async function runAssetSearch(args: Record<string, unknown>): Promise<AssetSearchResult> {
  const registry = await getRegistry();
  return registry.search(parseAssetSearchInput(args));
}

export async function runCatalogTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const registry = await getRegistry();
  const writer = createAssetCatalogWriter(registry);

  if (name === 'asset_search') return runAssetSearch(args);
  if (name === 'asset_get') {
    if (typeof args.id !== 'string' || !args.id.trim()) {
      throw new AssetRegistryError('invalid_type', 'id is required', 'id');
    }
    const version = typeof args.version === 'string' ? args.version : undefined;
    const detail = registry.getDetail(args.id.trim(), version);
    return {
      catalogRevision: registry.getSnapshot().revision,
      asset: detail
        ? {
            manifest: detail.manifest,
            contentHash: detail.contentHash,
            storageScope: detail.storageScope,
            writable: detail.writable,
          }
        : null,
      message: detail ? undefined : `Asset ${args.id}${version ? `@${version}` : ''} was not found. Try asset_search.`,
    };
  }
  if (name === 'asset_validate_manifest') {
    const validated = validateAssetManifest(args.manifest);
    if (!validated.success) {
      return { valid: false, errors: validated.errors, warnings: validated.warnings };
    }
    if (args.targetStage && validated.manifest.status !== args.targetStage) {
      return {
        valid: false,
        errors: [{ path: 'status', code: 'target_stage_mismatch', message: `status must be ${args.targetStage} for targetStage` }],
        warnings: validated.warnings,
      };
    }
    return {
      valid: true,
      normalizedManifest: validated.manifest,
      contentHash: computeAssetContentHash(validated.manifest),
      errors: [],
      warnings: validated.warnings,
    };
  }
  if (name === 'asset_find_similar') {
    const candidate = args.candidate;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new AssetRegistryError('invalid_type', 'candidate must be an object', 'candidate');
    }
    const c = candidate as Record<string, unknown>;
    if (typeof c.name !== 'string' || !c.name.trim()) {
      throw new AssetRegistryError('invalid_type', 'candidate.name is required', 'candidate.name');
    }
    return findSimilarAssets(
      registry.getSnapshot().assets,
      {
        id: typeof c.id === 'string' ? c.id : undefined,
        version: typeof c.version === 'string' ? c.version : undefined,
        name: c.name,
        description: typeof c.description === 'string' ? c.description : undefined,
        kind: typeof c.kind === 'string' ? c.kind as never : undefined,
        categories: Array.isArray(c.categories) ? c.categories.filter((item): item is string => typeof item === 'string') : undefined,
        tags: Array.isArray(c.tags) ? c.tags.filter((item): item is string => typeof item === 'string') : undefined,
        aliases: Array.isArray(c.aliases) ? c.aliases.filter((item): item is string => typeof item === 'string') : undefined,
        capabilities: Array.isArray(c.capabilities) ? c.capabilities.filter((item): item is string => typeof item === 'string') : undefined,
        styleTags: Array.isArray(c.styleTags) ? c.styleTags.filter((item): item is string => typeof item === 'string') : undefined,
      },
      registry.getSnapshot().revision,
      {
        statuses: Array.isArray(args.statuses) ? args.statuses as AssetStatus[] : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      },
    );
  }
  if (name === 'asset_create_draft') return writer.createDraft(args as never);
  if (name === 'asset_update_draft') return writer.updateDraft(args as never);
  if (name === 'asset_transition_status') return writer.transitionStatus(args as never);
  return undefined;
}

export type { GlobalAssetRegistry };
