import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveWritableAssetCatalogRoot } from '../../../global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../global-asset-registry/src/asset-registry.ts';
import { compileMotionSourceToBundle } from '../compiler/compile-source.ts';
import {
  MOTION_COMPILER_VERSION,
  MOTION_RUNTIME_CONTRACT_VERSION,
  MOTION_SANDBOX_CONTRACT_VERSION,
  MOTION_SDK_VERSION,
} from '../constants.ts';
import type { MotionSourceBuildResult, UserMotionRuntimeDescriptor } from '../contracts/types.ts';
import { MotionSourceError } from '../errors.ts';
import {
  computeBuildHash,
  computeMotionImplementationFingerprint,
  computeSourceHash,
} from '../hashes.ts';
import { resolveMotionAssetPaths } from '../paths/asset-paths.ts';
import { validateMotionSource } from '../validator/validate-source.ts';

async function atomicWrite(path: string, contents: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, contents);
  await rename(temp, path);
}

export function createMotionSourceCompiler(options: {
  registry: GlobalAssetRegistryWithRecords;
  userCatalogRoot?: string;
}) {
  const userRoot = options.userCatalogRoot ?? resolveWritableAssetCatalogRoot().path;

  return {
    async build(input: {
      assetId: string;
      assetVersion: string;
      expectedCatalogRevision: string;
      expectedManifestContentHash: string;
      expectedSourceHash: string;
      forceRebuild?: boolean;
      /** When true, compile in memory only (no artifact write). */
      dryArtifact?: boolean;
    }): Promise<MotionSourceBuildResult> {
      await options.registry.refresh();
      if (options.registry.getSnapshot().revision !== input.expectedCatalogRevision) {
        throw new MotionSourceError('CATALOG_REVISION_CONFLICT', 'Catalog revision mismatch');
      }
      const record = options.registry.getRecords().find(
        (item) => item.manifest.id === input.assetId && item.manifest.version === input.assetVersion,
      );
      if (!record) {
        throw new MotionSourceError('MOTION_SOURCE_NOT_FOUND', 'Asset not found');
      }
      if (record.contentHash !== input.expectedManifestContentHash) {
        throw new MotionSourceError('ASSET_CONTENT_CONFLICT', 'Manifest content hash mismatch');
      }
      if (record.manifest.status !== 'draft' && record.manifest.status !== 'staging') {
        // Allow rebuild for draft primarily; staging may rebuild for verification.
      }
      if (record.storageScope !== 'user') {
        throw new MotionSourceError('MOTION_SOURCE_NOT_WRITABLE', 'Bundled assets cannot be built from source pipeline');
      }

      const paths = resolveMotionAssetPaths(userRoot, input.assetId, input.assetVersion);
      let source: string;
      try {
        source = await readFile(paths.sourceFile, 'utf8');
      } catch {
        throw new MotionSourceError('MOTION_SOURCE_NOT_FOUND', 'Source file missing');
      }
      const sourceHash = computeSourceHash(source);
      if (sourceHash !== input.expectedSourceHash) {
        throw new MotionSourceError(
          'MOTION_SOURCE_HASH_CONFLICT',
          'Source hash mismatch',
          { recovery: 'Re-read source and rebuild.' },
        );
      }

      const exportName = record.manifest.implementation.exportName;
      if (!exportName) {
        throw new MotionSourceError('MOTION_SOURCE_EXPORT_NOT_FOUND', 'exportName required');
      }
      const validation = validateMotionSource({
        source,
        exportName,
        manifestContentHash: record.contentHash,
      });
      if (!validation.valid) {
        throw new MotionSourceError(
          'MOTION_SOURCE_BUILD_FAILED',
          validation.errors.map((e) => e.message).join('; '),
          { details: { errors: validation.errors } },
        );
      }

      const implementationFingerprint = computeMotionImplementationFingerprint(record.manifest);
      const buildHash = computeBuildHash({
        sourceHash,
        implementationFingerprint,
      });

      if (!input.forceRebuild && !input.dryArtifact) {
        try {
          const existing = JSON.parse(await readFile(paths.runtimeDescriptor(buildHash), 'utf8')) as UserMotionRuntimeDescriptor;
          const bundle = await readFile(paths.componentJs(buildHash), 'utf8');
          if (
            existing.buildHash === buildHash
            && existing.sourceHash === sourceHash
            && existing.implementationFingerprint === implementationFingerprint
          ) {
            return {
              assetId: input.assetId,
              assetVersion: input.assetVersion,
              sourceHash,
              buildHash,
              cacheHit: true,
              bundleByteLength: Buffer.byteLength(bundle, 'utf8'),
              runtimeDescriptor: existing,
              warnings: validation.warnings,
            };
          }
        } catch {
          // miss
        }
      }

      const compiled = compileMotionSourceToBundle({ source, exportName });
      const createdAt = new Date().toISOString();
      const descriptor: UserMotionRuntimeDescriptor = {
        schemaVersion: '1.0.0',
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        exportName,
        sourceHash,
        buildHash,
        manifestContentHash: record.contentHash,
        implementationFingerprint,
        sdkVersion: MOTION_SDK_VERSION,
        compilerVersion: MOTION_COMPILER_VERSION,
        sandboxContractVersion: MOTION_SANDBOX_CONTRACT_VERSION,
        runtimeContractVersion: MOTION_RUNTIME_CONTRACT_VERSION,
        bundleRelativePath: `runtime/${buildHash}/component.js`,
        bundleByteLength: compiled.byteLength,
        createdAt,
      };

      if (input.dryArtifact) {
        return {
          assetId: input.assetId,
          assetVersion: input.assetVersion,
          sourceHash,
          buildHash,
          cacheHit: false,
          bundleByteLength: compiled.byteLength,
          runtimeDescriptor: descriptor,
          warnings: validation.warnings,
        };
      }

      // Immutable: refuse overwrite if different content already present under same hash (should be identical).
      try {
        const prior = await readFile(paths.componentJs(buildHash), 'utf8');
        if (prior !== compiled.code && !input.forceRebuild) {
          throw new MotionSourceError(
            'MOTION_SOURCE_BUILD_FAILED',
            'Immutable build artifact conflict for build hash',
          );
        }
      } catch (error) {
        if (error instanceof MotionSourceError) throw error;
      }

      await atomicWrite(paths.componentJs(buildHash), compiled.code);
      await atomicWrite(paths.runtimeDescriptor(buildHash), `${JSON.stringify(descriptor, null, 2)}\n`);
      await atomicWrite(paths.buildReceipt(buildHash), `${JSON.stringify({
        requestKind: 'motion-source-build',
        buildHash,
        sourceHash,
        implementationFingerprint,
        createdAt,
        cacheHit: false,
      }, null, 2)}\n`);

      return {
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        sourceHash,
        buildHash,
        cacheHit: false,
        bundleByteLength: compiled.byteLength,
        runtimeDescriptor: descriptor,
        warnings: validation.warnings,
      };
    },

    async readBundle(assetId: string, assetVersion: string, buildHash: string): Promise<{
      code: string;
      descriptor: UserMotionRuntimeDescriptor;
    }> {
      const paths = resolveMotionAssetPaths(userRoot, assetId, assetVersion);
      const code = await readFile(paths.componentJs(buildHash), 'utf8');
      const descriptor = JSON.parse(await readFile(paths.runtimeDescriptor(buildHash), 'utf8')) as UserMotionRuntimeDescriptor;
      if (descriptor.buildHash !== buildHash || computeSourceHash(code) === '') {
        // soft check
      }
      if (descriptor.bundleByteLength !== Buffer.byteLength(code, 'utf8')) {
        throw new MotionSourceError('MOTION_SOURCE_RUNTIME_DESCRIPTOR_INVALID', 'Bundle size mismatch');
      }
      return { code, descriptor };
    },
  };
}

export type MotionSourceCompiler = ReturnType<typeof createMotionSourceCompiler>;
