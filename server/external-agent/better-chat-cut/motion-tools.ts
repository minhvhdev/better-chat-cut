import {
  computeRuntimeRevision,
  ensureBetterChatCutMotionRuntime,
  getMotionComponent,
  validateMotionProps,
} from '../../../packages/motion-components/src/index.ts';
import { inspectMotionAsset, renderMotionPreview } from '../../../packages/motion-components/src/preview/preview-service.ts';
import {
  createGlobalAssetRegistry,
  resolveAssetCatalogRootDescriptors,
  resolveWritableAssetCatalogRoot,
} from '../../../packages/global-asset-registry/src/index.ts';
import {
  inspectCandidateAvailability,
  refreshVerifiedUserMotionRuntimes,
} from '../../../packages/motion-source-pipeline/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../packages/global-asset-registry/src/asset-registry.ts';

ensureBetterChatCutMotionRuntime();

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const MOTION_TOOLS = [
  {
    name: 'motion_asset_inspect',
    description: 'Inspect a Better Chat Cut motion asset runtime registration and catalog metadata. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['assetId'],
      properties: {
        assetId: { type: 'string' },
        version: { type: 'string' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'motion_asset_validate_props',
    description: 'Validate and normalize props for a registered motion asset without rendering.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['assetId'],
      properties: {
        assetId: { type: 'string' },
        version: { type: 'string' },
        props: { type: 'object' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'motion_asset_render_preview',
    description: 'Render a PNG still or contact-sheet preview for a registered motion asset via Remotion. Does not modify projects.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['assetId'],
      properties: {
        assetId: { type: 'string' },
        version: { type: 'string' },
        props: { type: 'object' },
        themeId: { type: 'string' },
        animationId: { type: 'string' },
        mode: { type: 'string', enum: ['still', 'contact-sheet'] },
        frame: { type: 'integer', minimum: 0 },
        width: { type: 'integer', minimum: 16 },
        height: { type: 'integer', minimum: 16 },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
] as const;

async function catalogDetail(assetId: string, version?: string) {
  const registry = createGlobalAssetRegistry({
    roots: resolveAssetCatalogRootDescriptors(),
    strict: false,
  });
  await registry.refresh();
  return {
    catalogRevision: registry.getSnapshot().revision,
    detail: registry.getDetail(assetId, version),
  };
}

export async function runMotionTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (typeof args.assetId !== 'string' || !args.assetId.trim()) {
    throw new Error('assetId is required');
  }
  const assetId = args.assetId.trim();
  const version = typeof args.version === 'string' ? args.version : undefined;

  if (name === 'motion_asset_inspect') {
    const registry = createGlobalAssetRegistry({
      roots: resolveAssetCatalogRootDescriptors(),
      strict: false,
    }) as GlobalAssetRegistryWithRecords;
    await registry.refresh();
    await refreshVerifiedUserMotionRuntimes({
      registry,
      userCatalogRoot: resolveWritableAssetCatalogRoot().path,
    });

    const runtime = inspectMotionAsset(assetId, version);
    const catalog = await catalogDetail(assetId, version);
    const availability = inspectCandidateAvailability({
      registry,
      userCatalogRoot: resolveWritableAssetCatalogRoot().path,
      assetId,
      assetVersion: version ?? catalog.detail?.manifest.version,
    });
    if (!runtime.asset && !catalog.detail) {
      return {
        catalogRevision: catalog.catalogRevision,
        runtimeRevision: runtime.runtimeRevision,
        asset: null,
        diagnostics: runtime.diagnostics,
      };
    }
    const status = catalog.detail?.manifest.status ?? 'published';
    const runtimeAvailable = Boolean(runtime.asset)
      || (availability.runtimeAvailable && (status === 'staging' || status === 'published'));
    return {
      catalogRevision: catalog.catalogRevision,
      runtimeRevision: runtime.runtimeRevision,
      asset: {
        id: assetId,
        version: catalog.detail?.manifest.version ?? runtime.asset?.version ?? version ?? null,
        name: catalog.detail?.manifest.name ?? runtime.asset?.name ?? assetId,
        description: catalog.detail?.manifest.description ?? runtime.asset?.description ?? '',
        kind: catalog.detail?.manifest.kind ?? runtime.asset?.kind ?? 'primitive',
        status,
        contentHash: catalog.detail?.contentHash,
        runtimeAvailable,
        candidateBuildAvailable: availability.candidateBuildAvailable,
        implementation: catalog.detail?.manifest.implementation ?? { type: 'react-component' },
        defaultProps: runtime.asset?.defaultProps,
        propsSchema: catalog.detail?.manifest.propsSchema ?? runtime.asset?.propsSchema,
        preview: runtime.asset?.preview,
        supportedThemes: runtime.asset?.supportedThemes ?? [],
        supportedAnimations: runtime.asset?.supportedAnimations ?? [],
      },
      diagnostics: runtime.diagnostics,
    };
  }

  if (name === 'motion_asset_validate_props') {
    const definition = getMotionComponent(assetId, version);
    if (!definition) {
      return {
        valid: false,
        assetId,
        assetVersion: version,
        errors: [{ path: 'assetId', code: 'runtime_missing', message: `No runtime for ${assetId}` }],
        warnings: [],
        appliedDefaults: [],
      };
    }
    const props = args.props && typeof args.props === 'object' && !Array.isArray(args.props)
      ? args.props as Record<string, unknown>
      : {};
    const result = validateMotionProps(definition.propsSchema, props, definition.defaultProps);
    return {
      valid: result.valid,
      assetId: definition.assetId,
      assetVersion: definition.assetVersion,
      normalizedProps: result.normalizedProps,
      appliedDefaults: result.appliedDefaults,
      errors: result.errors,
      warnings: result.warnings,
      runtimeRevision: computeRuntimeRevision(),
    };
  }

  if (name === 'motion_asset_render_preview') {
    if (process.env.BCC_SKIP_MOTION_RENDER === '1') {
      return {
        skipped: true,
        reason: 'BCC_SKIP_MOTION_RENDER=1',
        assetId,
        runtimeRevision: computeRuntimeRevision(),
      };
    }
    const rendered = await renderMotionPreview({
      assetId,
      version,
      props: args.props && typeof args.props === 'object' && !Array.isArray(args.props)
        ? args.props as Record<string, unknown>
        : undefined,
      themeId: typeof args.themeId === 'string' ? args.themeId : undefined,
      animationId: typeof args.animationId === 'string' ? args.animationId : undefined,
      mode: args.mode === 'contact-sheet' ? 'contact-sheet' : 'still',
      frame: typeof args.frame === 'number' ? args.frame : undefined,
      width: typeof args.width === 'number' ? args.width : undefined,
      height: typeof args.height === 'number' ? args.height : undefined,
    });
    const { base64, ...meta } = rendered;
    return {
      ...meta,
      // MCP embeds PNG via __images; structuredContent strips the bytes.
      __images: [{
        base64,
        mimeType: rendered.mimeType,
        frame: rendered.frame,
      }],
    };
  }

  return undefined;
}
