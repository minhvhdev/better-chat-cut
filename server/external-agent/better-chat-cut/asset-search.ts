import {
  AssetRegistryError,
  createGlobalAssetRegistry,
  resolveAssetCatalogRoots,
  type AssetSearchInput,
  type AssetSearchResult,
  type GlobalAssetRegistry,
} from '../../../packages/global-asset-registry/src/index.ts';
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

let registryPromise: Promise<GlobalAssetRegistry> | null = null;

async function getRegistry(): Promise<GlobalAssetRegistry> {
  if (!registryPromise) {
    registryPromise = (async () => {
      const registry = createGlobalAssetRegistry({
        roots: resolveAssetCatalogRoots(),
        strict: false,
      });
      await registry.refresh();
      return registry;
    })();
  }
  return registryPromise;
}

/** Test helper: point the MCP adapter at fixture catalogs. */
export async function resetBetterChatCutAssetRegistryForTests(
  roots: string[],
): Promise<GlobalAssetRegistry> {
  const registry = createGlobalAssetRegistry({ roots, strict: false });
  await registry.refresh();
  registryPromise = Promise.resolve(registry);
  return registry;
}

export const ASSET_SEARCH_TOOL = {
  name: 'asset_search',
  description:
    'Search the Better Chat Cut shared asset catalog before creating new visual assets or motion components. Returns reusable assets ranked by metadata relevance and filtered by kind, category, capability, implementation type, and lifecycle status. This tool is read-only and does not modify projects or catalog files.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', description: 'Free-text query across id, name, aliases, tags, capabilities, categories, and description.' },
      kinds: {
        type: 'array',
        items: { type: 'string', enum: [...ASSET_KINDS] },
        description: 'Filter by asset kind. Multiple values are OR.',
      },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by category slugs. Multiple values are OR.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags. Multiple values are OR.',
      },
      capabilities: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by capabilities. Multiple values are OR.',
      },
      implementationTypes: {
        type: 'array',
        items: { type: 'string', enum: [...ASSET_IMPLEMENTATION_TYPES] },
        description: 'Filter by implementation type. Multiple values are OR.',
      },
      statuses: {
        type: 'array',
        items: { type: 'string', enum: [...ASSET_STATUSES] },
        description: 'Override default status filter (published+staging).',
      },
      includeDeprecated: {
        type: 'boolean',
        description: 'Include deprecated assets when statuses is omitted.',
      },
      includePropsSchema: {
        type: 'boolean',
        description: 'Include propsSchema in each summary when true.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: 'Max results to return (default 20, max 50).',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Pagination offset (default 0).',
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
} as const;

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
    if (typeof args.query !== 'string') {
      throw new AssetRegistryError('invalid_type', 'query must be a string', 'query');
    }
    input.query = args.query;
  }
  if (args.kinds !== undefined) input.kinds = asStringArray(args.kinds, 'kinds') as AssetSearchInput['kinds'];
  if (args.categories !== undefined) input.categories = asStringArray(args.categories, 'categories');
  if (args.tags !== undefined) input.tags = asStringArray(args.tags, 'tags');
  if (args.capabilities !== undefined) input.capabilities = asStringArray(args.capabilities, 'capabilities');
  if (args.implementationTypes !== undefined) {
    input.implementationTypes = asStringArray(args.implementationTypes, 'implementationTypes') as AssetSearchInput['implementationTypes'];
  }
  if (args.statuses !== undefined) {
    input.statuses = asStringArray(args.statuses, 'statuses') as AssetSearchInput['statuses'];
  }
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
    if (typeof args.limit !== 'number' || !Number.isInteger(args.limit)) {
      throw new AssetRegistryError('invalid_type', 'limit must be an integer', 'limit');
    }
    if (args.limit < MIN_SEARCH_LIMIT || args.limit > MAX_SEARCH_LIMIT) {
      throw new AssetRegistryError(
        'invalid_limit',
        `limit must be an integer between ${MIN_SEARCH_LIMIT} and ${MAX_SEARCH_LIMIT}`,
        'limit',
      );
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
  const input = parseAssetSearchInput(args);
  const registry = await getRegistry();
  return registry.search(input);
}
