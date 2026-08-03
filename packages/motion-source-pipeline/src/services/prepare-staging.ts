import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  createAssetCatalogWriter,
  resolveWritableAssetCatalogRoot,
  type AssetManifestV1,
} from '../../../global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../global-asset-registry/src/asset-registry.ts';
import { MotionSourceError } from '../errors.ts';
import { resolveMotionAssetPaths } from '../paths/asset-paths.ts';
import { createMotionSourceCompiler } from './build-service.ts';
import { createMotionCandidatePreviewService } from './candidate-preview.ts';
import { createMotionAssetSourceService } from './source-service.ts';
import { refreshVerifiedUserMotionRuntimes } from '../runtime/user-runtime-registry.ts';

async function atomicWriteBuffer(path: string, contents: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, contents);
  await rename(temp, path);
}

export function createMotionAssetStagingPreparationService(options: {
  registry: GlobalAssetRegistryWithRecords;
  userCatalogRoot?: string;
}) {
  const userRoot = options.userCatalogRoot ?? resolveWritableAssetCatalogRoot().path;
  const sourceService = createMotionAssetSourceService(options);
  const compiler = createMotionSourceCompiler(options);
  const preview = createMotionCandidatePreviewService(options);
  const writer = createAssetCatalogWriter(options.registry);

  return {
    async prepare(input: {
      requestId: string;
      expectedCatalogRevision: string;
      expectedManifestContentHash: string;
      expectedSourceHash: string;
      assetId: string;
      assetVersion: string;
      defaultProps?: Record<string, unknown>;
      themeId?: string;
      stillFrame?: number;
      contactSheetFrames?: number[];
      dryRun?: boolean;
    }) {
      const dryRun = input.dryRun !== false;
      await options.registry.refresh();

      const record = options.registry.getRecords().find(
        (item) => item.manifest.id === input.assetId && item.manifest.version === input.assetVersion,
      );
      if (!record) throw new MotionSourceError('MOTION_SOURCE_NOT_FOUND', 'Asset not found');
      if (record.manifest.status !== 'draft') {
        throw new MotionSourceError('MOTION_SOURCE_ASSET_NOT_DRAFT', 'Prepare-staging requires draft status');
      }

      const validation = await sourceService.validateSource({
        assetId: input.assetId,
        assetVersion: input.assetVersion,
      });
      if (!validation.valid || validation.sourceHash !== input.expectedSourceHash) {
        throw new MotionSourceError(
          'MOTION_SOURCE_PREPARE_FAILED',
          validation.valid ? 'Source hash mismatch' : validation.errors.map((e) => e.message).join('; '),
        );
      }

      const built = await compiler.build({
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        expectedCatalogRevision: input.expectedCatalogRevision,
        expectedManifestContentHash: input.expectedManifestContentHash,
        expectedSourceHash: input.expectedSourceHash,
        dryArtifact: dryRun,
      });

      // For dry-run without artifacts on disk, force a real build into immutable cache so preview can run.
      const ensured = dryRun
        ? await compiler.build({
          assetId: input.assetId,
          assetVersion: input.assetVersion,
          expectedCatalogRevision: input.expectedCatalogRevision,
          expectedManifestContentHash: input.expectedManifestContentHash,
          expectedSourceHash: input.expectedSourceHash,
        })
        : built;

      const themeId = input.themeId ?? 'default';
      const stillFrame = input.stillFrame ?? 15;
      const contactSheetFrames = input.contactSheetFrames ?? [0, 12, 24, 36, 44];
      const props = input.defaultProps;

      const still = await preview.renderPreview({
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        buildHash: ensured.buildHash,
        sourceHash: input.expectedSourceHash,
        expectedCatalogRevision: input.expectedCatalogRevision,
        expectedManifestContentHash: input.expectedManifestContentHash,
        props,
        themeId,
        mode: 'still',
        frame: stillFrame,
        verifyDeterminism: true,
      });

      const sheet = await preview.renderPreview({
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        buildHash: ensured.buildHash,
        sourceHash: input.expectedSourceHash,
        expectedCatalogRevision: input.expectedCatalogRevision,
        expectedManifestContentHash: input.expectedManifestContentHash,
        props,
        themeId,
        mode: 'contact-sheet',
        frames: contactSheetFrames,
      });

      const exportName = record.manifest.implementation.exportName!;
      const predictedManifest: AssetManifestV1 = {
        ...record.manifest,
        status: 'draft',
        implementation: {
          type: 'react-component',
          entry: `runtime/${ensured.buildHash}/component.js`,
          exportName,
        },
        previews: [
          {
            type: 'image',
            path: `previews/${ensured.buildHash}/still.png`,
            mimeType: 'image/png',
          },
          {
            type: 'image',
            path: `previews/${ensured.buildHash}/contact-sheet.png`,
            mimeType: 'image/png',
          },
        ],
        provenance: record.manifest.provenance ?? {
          origin: 'agent',
          createdBy: 'better-chat-cut-motion-source',
        },
      };

      if (dryRun) {
        return {
          applied: false,
          dryRun: true as const,
          assetId: input.assetId,
          assetVersion: input.assetVersion,
          sourceHash: input.expectedSourceHash,
          buildHash: ensured.buildHash,
          predictedManifest,
          catalogRevision: options.registry.getSnapshot().revision,
          manifestContentHash: input.expectedManifestContentHash,
          verification: {
            still: { cacheHit: still.cacheHit, determinism: still.determinism },
            contactSheet: { cacheHit: sheet.cacheHit },
            sandbox: still.sandbox,
          },
          recovery: 'Call asset_transition_status with targetStatus="staging" after apply, using the returned catalog revision and content hash.',
        };
      }

      const paths = resolveMotionAssetPaths(userRoot, input.assetId, input.assetVersion);
      await atomicWriteBuffer(paths.stillPreview(ensured.buildHash), Buffer.from(still.base64, 'base64'));
      await atomicWriteBuffer(paths.contactSheetPreview(ensured.buildHash), Buffer.from(sheet.base64, 'base64'));

      // Re-check revision before manifest write
      await options.registry.refresh();
      if (options.registry.getSnapshot().revision !== input.expectedCatalogRevision) {
        throw new MotionSourceError('CATALOG_REVISION_CONFLICT', 'Catalog changed during prepare');
      }

      const updated = await writer.updateDraft({
        requestId: input.requestId,
        expectedCatalogRevision: input.expectedCatalogRevision,
        expectedContentHash: input.expectedManifestContentHash,
        dryRun: false,
        manifest: predictedManifest,
        duplicateOverride: { reason: 'Prepared authored motion runtime from verified candidate build' },
      });

      if (!updated.applied) {
        throw new MotionSourceError('MOTION_SOURCE_PREPARE_FAILED', 'Manifest update did not apply');
      }

      await refreshVerifiedUserMotionRuntimes({
        registry: options.registry,
        userCatalogRoot: userRoot,
      });

      return {
        applied: true,
        dryRun: false as const,
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        sourceHash: input.expectedSourceHash,
        buildHash: ensured.buildHash,
        manifest: updated.asset.manifest,
        catalogRevision: updated.catalogRevision,
        manifestContentHash: updated.asset.contentHash,
        verification: {
          still: { cacheHit: still.cacheHit, determinism: still.determinism },
          contactSheet: { cacheHit: sheet.cacheHit },
          sandbox: still.sandbox,
        },
        recovery: 'Call asset_transition_status with targetStatus="staging" using the returned catalog revision and content hash.',
      };
    },
  };
}
