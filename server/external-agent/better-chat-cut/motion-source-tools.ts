import {
  createGlobalAssetRegistry,
  resolveAssetCatalogRootDescriptors,
  resolveWritableAssetCatalogRoot,
} from '../../../packages/global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../packages/global-asset-registry/src/asset-registry.ts';
import {
  createMotionAssetSourceService,
  createMotionAssetStagingPreparationService,
  createMotionCandidatePreviewService,
  createMotionSourceCompiler,
  getMotionSourceContract,
  inspectCandidateAvailability,
  MotionSourceError,
  refreshVerifiedUserMotionRuntimes,
} from '../../../packages/motion-source-pipeline/src/index.ts';

let registryPromise: Promise<GlobalAssetRegistryWithRecords> | null = null;

async function getRegistry(): Promise<GlobalAssetRegistryWithRecords> {
  if (!registryPromise) {
    registryPromise = (async () => {
      const registry = createGlobalAssetRegistry({
        roots: resolveAssetCatalogRootDescriptors(),
        strict: false,
      }) as GlobalAssetRegistryWithRecords;
      await registry.refresh();
      await refreshVerifiedUserMotionRuntimes({ registry });
      return registry;
    })();
  }
  return registryPromise;
}

export async function resetMotionSourceRegistryForTests(
  roots: Array<string | { path: string; scope?: 'bundled' | 'user'; writable?: boolean }>,
): Promise<GlobalAssetRegistryWithRecords> {
  const registry = createGlobalAssetRegistry({ roots, strict: false }) as GlobalAssetRegistryWithRecords;
  await registry.refresh();
  await refreshVerifiedUserMotionRuntimes({
    registry,
    userCatalogRoot: resolveWritableAssetCatalogRoot().path,
  });
  registryPromise = Promise.resolve(registry);
  return registry;
}

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const MOTION_SOURCE_TOOLS = [
  {
    name: 'motion_source_get_contract',
    description: 'Return the Better Chat Cut restricted motion authoring source contract, SDK allowlist, and template. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['summary', 'full'] },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'motion_asset_source_get',
    description: 'Read authored motion source and build metadata for a user catalog asset. Does not expose absolute paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['assetId', 'assetVersion'],
      properties: {
        assetId: { type: 'string' },
        assetVersion: { type: 'string' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'motion_asset_source_put',
    description: 'Validate and write authored motion source for a draft user asset. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'requestId',
        'expectedCatalogRevision',
        'expectedManifestContentHash',
        'assetId',
        'assetVersion',
        'source',
      ],
      properties: {
        requestId: { type: 'string' },
        expectedCatalogRevision: { type: 'string' },
        expectedManifestContentHash: { type: 'string' },
        expectedSourceHash: { type: 'string' },
        assetId: { type: 'string' },
        assetVersion: { type: 'string' },
        source: { type: 'string' },
        dryRun: { type: 'boolean' },
      },
    },
    annotations: writeAnnotations,
  },
  {
    name: 'motion_asset_source_validate',
    description: 'Validate authored motion source (stored or provided) without writing files.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['assetId', 'assetVersion'],
      properties: {
        assetId: { type: 'string' },
        assetVersion: { type: 'string' },
        source: { type: 'string' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'motion_asset_source_build',
    description: 'Build an immutable candidate runtime artifact from draft motion source. Does not update the manifest or register normal runtime.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'assetId',
        'assetVersion',
        'expectedCatalogRevision',
        'expectedManifestContentHash',
        'expectedSourceHash',
      ],
      properties: {
        assetId: { type: 'string' },
        assetVersion: { type: 'string' },
        expectedCatalogRevision: { type: 'string' },
        expectedManifestContentHash: { type: 'string' },
        expectedSourceHash: { type: 'string' },
        forceRebuild: { type: 'boolean' },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'motion_asset_source_render_preview',
    description: 'Render a candidate authored motion still or contact-sheet via Remotion Chromium sandbox. PNG returned via __images.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['assetId', 'assetVersion', 'mode', 'expectedCatalogRevision', 'expectedManifestContentHash'],
      properties: {
        assetId: { type: 'string' },
        assetVersion: { type: 'string' },
        buildHash: { type: 'string' },
        expectedCatalogRevision: { type: 'string' },
        expectedManifestContentHash: { type: 'string' },
        expectedSourceHash: { type: 'string' },
        props: { type: 'object' },
        themeId: { type: 'string' },
        mode: { type: 'string', enum: ['still', 'contact-sheet'] },
        frame: { type: 'integer', minimum: 0 },
        frames: { type: 'array', items: { type: 'integer', minimum: 0 } },
        columns: { type: 'integer', minimum: 1 },
        width: { type: 'integer', minimum: 16 },
        height: { type: 'integer', minimum: 16 },
        fps: { type: 'integer', minimum: 1 },
        durationInFrames: { type: 'integer', minimum: 1 },
        verifyDeterminism: { type: 'boolean' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'motion_asset_prepare_staging',
    description: 'Validate, build, preview, and update a draft motion asset for staging. Does not transition status. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'requestId',
        'expectedCatalogRevision',
        'expectedManifestContentHash',
        'expectedSourceHash',
        'assetId',
        'assetVersion',
      ],
      properties: {
        requestId: { type: 'string' },
        expectedCatalogRevision: { type: 'string' },
        expectedManifestContentHash: { type: 'string' },
        expectedSourceHash: { type: 'string' },
        assetId: { type: 'string' },
        assetVersion: { type: 'string' },
        defaultProps: { type: 'object' },
        themeId: { type: 'string' },
        stillFrame: { type: 'integer', minimum: 0 },
        contactSheetFrames: { type: 'array', items: { type: 'integer', minimum: 0 } },
        dryRun: { type: 'boolean' },
      },
    },
    annotations: writeAnnotations,
  },
] as const;

function rethrow(error: unknown): never {
  if (error instanceof MotionSourceError) {
    throw error;
  }
  throw error;
}

export async function runMotionSourceTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    if (name === 'motion_source_get_contract') {
      const format = args.format === 'full' ? 'full' : 'summary';
      return getMotionSourceContract(format);
    }

    const registry = await getRegistry();
    const userRoot = resolveWritableAssetCatalogRoot().path;
    const sourceService = createMotionAssetSourceService({ registry, userCatalogRoot: userRoot });
    const compiler = createMotionSourceCompiler({ registry, userCatalogRoot: userRoot });
    const preview = createMotionCandidatePreviewService({ registry, userCatalogRoot: userRoot });
    const prepare = createMotionAssetStagingPreparationService({ registry, userCatalogRoot: userRoot });

    if (name === 'motion_asset_source_get') {
      return sourceService.getSource({
        assetId: String(args.assetId),
        assetVersion: String(args.assetVersion),
      });
    }

    if (name === 'motion_asset_source_put') {
      return sourceService.putSource({
        requestId: String(args.requestId),
        expectedCatalogRevision: String(args.expectedCatalogRevision),
        expectedManifestContentHash: String(args.expectedManifestContentHash),
        expectedSourceHash: typeof args.expectedSourceHash === 'string' ? args.expectedSourceHash : undefined,
        assetId: String(args.assetId),
        assetVersion: String(args.assetVersion),
        source: String(args.source),
        dryRun: args.dryRun !== false,
      });
    }

    if (name === 'motion_asset_source_validate') {
      const result = await sourceService.validateSource({
        assetId: String(args.assetId),
        assetVersion: String(args.assetVersion),
        source: typeof args.source === 'string' ? args.source : undefined,
      });
      return {
        ...result,
        buildable: result.buildable,
        recovery: result.valid
          ? undefined
          : result.errors[0]?.recovery ?? 'Fix validation errors then retry.',
      };
    }

    if (name === 'motion_asset_source_build') {
      const built = await compiler.build({
        assetId: String(args.assetId),
        assetVersion: String(args.assetVersion),
        expectedCatalogRevision: String(args.expectedCatalogRevision),
        expectedManifestContentHash: String(args.expectedManifestContentHash),
        expectedSourceHash: String(args.expectedSourceHash),
        forceRebuild: args.forceRebuild === true,
      });
      return {
        assetId: built.assetId,
        assetVersion: built.assetVersion,
        sourceHash: built.sourceHash,
        buildHash: built.buildHash,
        cacheHit: built.cacheHit,
        bundleByteLength: built.bundleByteLength,
        runtimeDescriptor: {
          sdkVersion: built.runtimeDescriptor.sdkVersion,
          compilerVersion: built.runtimeDescriptor.compilerVersion,
          sandboxContractVersion: built.runtimeDescriptor.sandboxContractVersion,
          runtimeContractVersion: built.runtimeDescriptor.runtimeContractVersion,
        },
        warnings: built.warnings,
      };
    }

    if (name === 'motion_asset_source_render_preview') {
      if (process.env.BCC_SKIP_MOTION_RENDER === '1') {
        return {
          skipped: true,
          reason: 'BCC_SKIP_MOTION_RENDER=1',
          assetId: args.assetId,
          assetVersion: args.assetVersion,
        };
      }
      return preview.renderPreview({
        assetId: String(args.assetId),
        assetVersion: String(args.assetVersion),
        buildHash: typeof args.buildHash === 'string' ? args.buildHash : undefined,
        sourceHash: typeof args.expectedSourceHash === 'string' ? args.expectedSourceHash : undefined,
        expectedCatalogRevision: String(args.expectedCatalogRevision),
        expectedManifestContentHash: String(args.expectedManifestContentHash),
        props: args.props && typeof args.props === 'object' && !Array.isArray(args.props)
          ? args.props as Record<string, unknown>
          : undefined,
        themeId: typeof args.themeId === 'string' ? args.themeId : undefined,
        mode: args.mode === 'contact-sheet' ? 'contact-sheet' : 'still',
        frame: typeof args.frame === 'number' ? args.frame : undefined,
        frames: Array.isArray(args.frames) ? args.frames.filter((n): n is number => typeof n === 'number') : undefined,
        width: typeof args.width === 'number' ? args.width : undefined,
        height: typeof args.height === 'number' ? args.height : undefined,
        fps: typeof args.fps === 'number' ? args.fps : undefined,
        durationInFrames: typeof args.durationInFrames === 'number' ? args.durationInFrames : undefined,
        verifyDeterminism: args.verifyDeterminism === true,
      });
    }

    if (name === 'motion_asset_prepare_staging') {
      return prepare.prepare({
        requestId: String(args.requestId),
        expectedCatalogRevision: String(args.expectedCatalogRevision),
        expectedManifestContentHash: String(args.expectedManifestContentHash),
        expectedSourceHash: String(args.expectedSourceHash),
        assetId: String(args.assetId),
        assetVersion: String(args.assetVersion),
        defaultProps: args.defaultProps && typeof args.defaultProps === 'object' && !Array.isArray(args.defaultProps)
          ? args.defaultProps as Record<string, unknown>
          : undefined,
        themeId: typeof args.themeId === 'string' ? args.themeId : undefined,
        stillFrame: typeof args.stillFrame === 'number' ? args.stillFrame : undefined,
        contactSheetFrames: Array.isArray(args.contactSheetFrames)
          ? args.contactSheetFrames.filter((n): n is number => typeof n === 'number')
          : undefined,
        dryRun: args.dryRun !== false,
      });
    }

    return undefined;
  } catch (error) {
    rethrow(error);
  }
}

export { inspectCandidateAvailability };
