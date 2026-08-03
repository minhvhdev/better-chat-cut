import {
  ASSET_REQUIREMENT_SCHEMA_VERSION,
  ASSET_PLAN_SCHEMA_VERSION,
  createBatchAssetResolver,
  computeAssetResolverRevision,
  type AssetPlanV1,
} from '../../../packages/asset-resolver/src/index.ts';
import {
  createGlobalAssetRegistry,
  resolveAssetCatalogRootDescriptors,
} from '../../../packages/global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../packages/global-asset-registry/src/asset-registry.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

let resolverPromise: Promise<ReturnType<typeof createBatchAssetResolver>> | null = null;
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

async function getResolver() {
  if (!resolverPromise) {
    resolverPromise = (async () => {
      const registry = await getRegistry();
      return createBatchAssetResolver({ registry });
    })();
  }
  return resolverPromise;
}

export async function resetAssetResolverRegistryForTests(
  roots: Array<string | { path: string; scope?: 'bundled' | 'user'; writable?: boolean }>,
): Promise<ReturnType<typeof createBatchAssetResolver>> {
  const registry = createGlobalAssetRegistry({ roots, strict: false });
  await registry.refresh();
  registryPromise = Promise.resolve(registry);
  const resolver = createBatchAssetResolver({ registry });
  resolverPromise = Promise.resolve(resolver);
  return resolver;
}

const requirementSetSchema = {
  type: 'object',
  description: 'AssetRequirementSetV1 JSON. Pure data only; no paths, URLs, source, or executable expressions.',
  additionalProperties: true,
  properties: {
    schemaVersion: { type: 'string', enum: [ASSET_REQUIREMENT_SCHEMA_VERSION] },
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    theme: { type: 'object' },
    defaultPolicy: { type: 'object' },
    requirements: { type: 'array' },
  },
} as const;

export const ASSET_RESOLVER_TOOLS = [
  {
    name: 'asset_resolver_get_contract',
    description:
      'Return Better Chat Cut Asset Resolver contract: requirement/plan schemas, policies, scoring weights, strategies, limits, and examples. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['summary', 'full'], description: 'summary or full contract payload' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'asset_requirements_validate',
    description:
      'Validate and normalize an AssetRequirementSetV1. Does not search catalog for resolution and does not mutate catalog/project/timeline.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requirementSet'],
      properties: {
        requirementSet: requirementSetSchema,
        includeNormalizedRequirementSet: { type: 'boolean' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'asset_resolve_batch',
    description:
      'Resolve a batch of visual requirements into a deterministic AssetPlanV1 (exact/reuse/variant/composition/duplicate review/creation brief). Read-only; does not create assets or scenes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requirementSet'],
      properties: {
        requirementSet: requirementSetSchema,
        includeCandidates: { type: 'boolean' },
        includeRejectedCandidates: { type: 'boolean' },
        candidateLimit: { type: 'integer', minimum: 1, maximum: 20 },
        rejectedCandidateLimit: { type: 'integer', minimum: 0, maximum: 20 },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'asset_plan_validate',
    description:
      'Validate an AssetPlanV1 against the current catalog/runtime/resolver revisions. Detects stale but reusable plans vs broken dependencies.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['plan'],
      properties: {
        plan: {
          type: 'object',
          description: 'AssetPlanV1 JSON',
          additionalProperties: true,
          properties: {
            schemaVersion: { type: 'string', enum: [ASSET_PLAN_SCHEMA_VERSION] },
            id: { type: 'string' },
            requirementSetId: { type: 'string' },
            planHash: { type: 'string' },
            decisions: { type: 'array' },
          },
        },
      },
    },
    annotations: readOnly,
  },
] as const;

function assertNoAbsolutePaths(value: unknown, path = ''): void {
  if (typeof value === 'string') {
    if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/') || value.includes('\\Users\\') || value.includes('/home/')) {
      throw new Error(`Absolute path leaked at ${path || 'root'}`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoAbsolutePaths(item, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertNoAbsolutePaths(v, path ? `${path}.${k}` : k);
    }
  }
}

export async function runAssetResolverTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const resolver = await getResolver();

  if (name === 'asset_resolver_get_contract') {
    const format = args.format === 'full' ? 'full' : 'summary';
    const result = resolver.getContract(format);
    assertNoAbsolutePaths(result);
    return result;
  }

  if (name === 'asset_requirements_validate') {
    const validated = resolver.validateRequirements(args.requirementSet);
    const result = {
      valid: validated.valid,
      requirementSetId: validated.normalizedRequirementSet?.id,
      requirementSetHash: validated.requirementSetHash,
      resolverRevision: computeAssetResolverRevision(),
      normalizedRequirementSet: args.includeNormalizedRequirementSet === true
        ? validated.normalizedRequirementSet
        : undefined,
      errors: validated.errors,
      warnings: validated.warnings,
    };
    assertNoAbsolutePaths(result);
    return result;
  }

  if (name === 'asset_resolve_batch') {
    if (!args.requirementSet || typeof args.requirementSet !== 'object') {
      return {
        code: 'ASSET_REQUIREMENT_SCHEMA_UNSUPPORTED',
        message: 'requirementSet is required',
        recovery: 'Pass an AssetRequirementSetV1 object',
      };
    }
    const result = await resolver.resolveBatch({
      requirementSet: args.requirementSet as never,
      includeCandidates: typeof args.includeCandidates === 'boolean' ? args.includeCandidates : undefined,
      includeRejectedCandidates: typeof args.includeRejectedCandidates === 'boolean'
        ? args.includeRejectedCandidates
        : undefined,
      candidateLimit: typeof args.candidateLimit === 'number' ? args.candidateLimit : undefined,
      rejectedCandidateLimit: typeof args.rejectedCandidateLimit === 'number'
        ? args.rejectedCandidateLimit
        : undefined,
    });
    assertNoAbsolutePaths(result);
    return result;
  }

  if (name === 'asset_plan_validate') {
    if (!args.plan || typeof args.plan !== 'object') {
      return {
        code: 'ASSET_PLAN_HASH_INVALID',
        message: 'plan is required',
        recovery: 'Pass an AssetPlanV1 object',
      };
    }
    const result = await resolver.validatePlan({ plan: args.plan as AssetPlanV1 });
    assertNoAbsolutePaths(result);
    return result;
  }

  return {
    code: 'UNKNOWN_TOOL',
    message: `Unknown asset resolver tool ${name}`,
    recovery: 'Use asset_resolver_get_contract, asset_requirements_validate, asset_resolve_batch, or asset_plan_validate',
  };
}
