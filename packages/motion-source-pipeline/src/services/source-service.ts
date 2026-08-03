import { appendFile, mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createGlobalAssetRegistry,
  resolveWritableAssetCatalogRoot,
  type AssetManifestV1,
  type AssetRegistryRecord,
  type GlobalAssetRegistry,
} from '../../../global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../global-asset-registry/src/asset-registry.ts';
import { MotionSourceError } from '../errors.ts';
import { computeInputHash, computeSourceHash } from '../hashes.ts';
import { assertSafeRequestId, resolveMotionAssetPaths } from '../paths/asset-paths.ts';
import { validateMotionSource } from '../validator/validate-source.ts';
import type {
  MotionSourceEvent,
  MotionSourceOperationReceipt,
  MotionSourceValidationResult,
} from '../contracts/types.ts';

export type MotionSourceServiceOptions = {
  registry: GlobalAssetRegistryWithRecords;
  userCatalogRoot?: string;
};

async function withAssetLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, 'w');
  try {
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    return await fn();
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, contents, 'utf8');
  await rename(temp, path);
}

function requireUserDraft(
  registry: GlobalAssetRegistry & { getRecords(): AssetRegistryRecord[] },
  assetId: string,
  assetVersion: string,
): AssetRegistryRecord {
  const record = registry.getRecords().find(
    (item) => item.manifest.id === assetId && item.manifest.version === assetVersion,
  );
  if (!record) {
    throw new MotionSourceError('MOTION_SOURCE_NOT_FOUND', `Asset ${assetId}@${assetVersion} not found`);
  }
  if (record.storageScope !== 'user' || !record.writable) {
    throw new MotionSourceError(
      'MOTION_SOURCE_NOT_WRITABLE',
      'Only writable user-catalog draft assets can store source',
      { recovery: 'Create a draft via asset_create_draft in the user catalog.' },
    );
  }
  if (record.manifest.status !== 'draft') {
    throw new MotionSourceError(
      'MOTION_SOURCE_ASSET_NOT_DRAFT',
      'Source writes are only allowed for draft assets',
      { recovery: 'Transition back to draft or create a new draft version.' },
    );
  }
  const impl = record.manifest.implementation;
  if (impl.type !== 'react-component' && impl.type !== 'remotion-component') {
    throw new MotionSourceError(
      'MOTION_SOURCE_NOT_WRITABLE',
      `Implementation type ${impl.type} does not support authored motion source`,
    );
  }
  if (!impl.exportName?.trim()) {
    throw new MotionSourceError(
      'MOTION_SOURCE_EXPORT_NOT_FOUND',
      'manifest.implementation.exportName is required',
    );
  }
  return record;
}

export function createMotionAssetSourceService(options: MotionSourceServiceOptions) {
  const userRoot = options.userCatalogRoot ?? resolveWritableAssetCatalogRoot().path;

  async function readSourceText(assetId: string, assetVersion: string): Promise<{
    exists: boolean;
    sourceHash?: string;
    byteLength?: number;
    text?: string;
  }> {
    const paths = resolveMotionAssetPaths(userRoot, assetId, assetVersion);
    try {
      const text = await readFile(paths.sourceFile, 'utf8');
      return {
        exists: true,
        sourceHash: computeSourceHash(text),
        byteLength: Buffer.byteLength(text, 'utf8'),
        text,
      };
    } catch {
      return { exists: false };
    }
  }

  async function appendSourceEvent(paths: ReturnType<typeof resolveMotionAssetPaths>, event: MotionSourceEvent): Promise<void> {
    await mkdir(paths.metaDir, { recursive: true });
    await appendFile(paths.sourceEvents, `${JSON.stringify(event)}\n`, 'utf8');
  }

  return {
    async getSource(input: { assetId: string; assetVersion: string }) {
      await options.registry.refresh();
      const record = options.registry.getRecords().find(
        (item) => item.manifest.id === input.assetId && item.manifest.version === input.assetVersion,
      );
      if (!record) {
        throw new MotionSourceError('MOTION_SOURCE_NOT_FOUND', `Asset ${input.assetId}@${input.assetVersion} not found`);
      }
      const source = await readSourceText(input.assetId, input.assetVersion);
      const paths = resolveMotionAssetPaths(userRoot, input.assetId, input.assetVersion);
      let latestBuild: { buildHash: string; sourceHash: string; validForCurrentSource: boolean } | undefined;
      try {
        const { readdir } = await import('node:fs/promises');
        const runtimeRoot = join(paths.versionRoot, 'runtime');
        const hashes = await readdir(runtimeRoot).catch(() => [] as string[]);
        for (const buildHash of hashes) {
          try {
            const raw = await readFile(paths.runtimeDescriptor(buildHash), 'utf8');
            const descriptor = JSON.parse(raw) as { buildHash: string; sourceHash: string };
            const validForCurrentSource = Boolean(source.sourceHash && descriptor.sourceHash === source.sourceHash);
            if (!latestBuild || validForCurrentSource) {
              latestBuild = {
                buildHash: descriptor.buildHash,
                sourceHash: descriptor.sourceHash,
                validForCurrentSource,
              };
              if (validForCurrentSource) break;
            }
          } catch {
            // ignore corrupt descriptors
          }
        }
      } catch {
        // no runtime dir
      }

      return {
        catalogRevision: options.registry.getSnapshot().revision,
        manifestContentHash: record.contentHash,
        assetStatus: record.manifest.status,
        writable: record.writable && record.storageScope === 'user' && record.manifest.status === 'draft',
        source: {
          exists: source.exists,
          sourceHash: source.sourceHash,
          byteLength: source.byteLength,
          text: source.text,
        },
        latestBuild,
      };
    },

    async validateSource(input: {
      assetId: string;
      assetVersion: string;
      source?: string;
    }): Promise<MotionSourceValidationResult> {
      await options.registry.refresh();
      const record = options.registry.getRecords().find(
        (item) => item.manifest.id === input.assetId && item.manifest.version === input.assetVersion,
      );
      if (!record) {
        throw new MotionSourceError('MOTION_SOURCE_NOT_FOUND', `Asset ${input.assetId}@${input.assetVersion} not found`);
      }
      let source = input.source;
      if (source === undefined) {
        const stored = await readSourceText(input.assetId, input.assetVersion);
        if (!stored.exists || stored.text === undefined) {
          throw new MotionSourceError('MOTION_SOURCE_NOT_FOUND', 'No source stored for this asset version');
        }
        source = stored.text;
      }
      const exportName = record.manifest.implementation.exportName ?? 'Component';
      return validateMotionSource({
        source,
        exportName,
        manifestContentHash: record.contentHash,
      });
    },

    async putSource(input: {
      requestId: string;
      expectedCatalogRevision: string;
      expectedManifestContentHash: string;
      expectedSourceHash?: string;
      assetId: string;
      assetVersion: string;
      source: string;
      dryRun?: boolean;
    }) {
      const requestId = assertSafeRequestId(input.requestId);
      const dryRun = input.dryRun !== false;
      await options.registry.refresh();
      if (options.registry.getSnapshot().revision !== input.expectedCatalogRevision) {
        throw new MotionSourceError(
          'CATALOG_REVISION_CONFLICT',
          'Catalog revision mismatch',
          { recovery: 'Re-read asset_get / motion_asset_source_get and retry.' },
        );
      }
      const record = requireUserDraft(options.registry, input.assetId, input.assetVersion);
      if (record.contentHash !== input.expectedManifestContentHash) {
        throw new MotionSourceError(
          'ASSET_CONTENT_CONFLICT',
          'Manifest content hash mismatch',
          { recovery: 'Re-read the asset and retry with the current content hash.' },
        );
      }

      const existing = await readSourceText(input.assetId, input.assetVersion);
      if (!existing.exists && input.expectedSourceHash) {
        throw new MotionSourceError(
          'MOTION_SOURCE_HASH_CONFLICT',
          'expectedSourceHash was set but no source exists yet',
        );
      }
      if (existing.exists) {
        if (!input.expectedSourceHash) {
          throw new MotionSourceError(
            'MOTION_SOURCE_HASH_CONFLICT',
            'expectedSourceHash is required when source already exists',
          );
        }
        if (input.expectedSourceHash !== existing.sourceHash) {
          throw new MotionSourceError(
            'MOTION_SOURCE_HASH_CONFLICT',
            'Source hash conflict',
            { recovery: 'Re-read motion_asset_source_get and retry.' },
          );
        }
      }

      const exportName = record.manifest.implementation.exportName!;
      const validation = validateMotionSource({
        source: input.source,
        exportName,
        manifestContentHash: record.contentHash,
      });
      if (!validation.valid) {
        throw new MotionSourceError(
          validation.errors[0]?.code ?? 'MOTION_SOURCE_PARSE_FAILED',
          validation.errors.map((e) => e.message).join('; '),
          { details: { errors: validation.errors, warnings: validation.warnings } },
        );
      }

      const resultingSourceHash = validation.sourceHash;
      const inputHash = computeInputHash({
        requestId,
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        sourceHash: resultingSourceHash,
        expectedManifestContentHash: input.expectedManifestContentHash,
      });
      const paths = resolveMotionAssetPaths(userRoot, input.assetId, input.assetVersion);
      const receiptPath = join(paths.sourceOperationsDir, `${requestId}.json`);

      try {
        const prior = JSON.parse(await readFile(receiptPath, 'utf8')) as MotionSourceOperationReceipt;
        if (prior.inputHash !== inputHash) {
          throw new MotionSourceError(
            'MOTION_SOURCE_REQUEST_ID_CONFLICT',
            'requestId was reused with different input',
          );
        }
        return {
          applied: !dryRun,
          dryRun,
          replayed: true,
          receipt: prior,
          validation,
          sourceHash: prior.resultingSourceHash,
          catalogRevision: options.registry.getSnapshot().revision,
          manifestContentHash: record.contentHash,
        };
      } catch (error) {
        if (error instanceof MotionSourceError) throw error;
      }

      if (dryRun) {
        return {
          applied: false,
          dryRun: true,
          replayed: false,
          validation,
          sourceHash: resultingSourceHash,
          catalogRevision: options.registry.getSnapshot().revision,
          manifestContentHash: record.contentHash,
          predictedOperation: existing.exists ? 'source-updated' : 'source-created',
        };
      }

      return withAssetLock(join(paths.metaDir, 'source.lock'), async () => {
        await atomicWrite(paths.sourceFile, input.source);
        const receipt: MotionSourceOperationReceipt = {
          requestId,
          inputHash,
          operation: existing.exists ? 'source-updated' : 'source-created',
          assetId: input.assetId,
          assetVersion: input.assetVersion,
          previousSourceHash: existing.sourceHash,
          resultingSourceHash,
          manifestContentHash: record.contentHash,
          completedAt: new Date().toISOString(),
        };
        await mkdir(paths.sourceOperationsDir, { recursive: true });
        await atomicWrite(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
        await appendSourceEvent(paths, {
          eventId: `${requestId}:${receipt.operation}`,
          requestId,
          eventType: receipt.operation === 'source-created' ? 'motion-source.created' : 'motion-source.updated',
          assetId: input.assetId,
          assetVersion: input.assetVersion,
          sourceHash: resultingSourceHash,
          manifestContentHash: record.contentHash,
          occurredAt: receipt.completedAt,
        });
        return {
          applied: true,
          dryRun: false,
          replayed: false,
          receipt,
          validation,
          sourceHash: resultingSourceHash,
          catalogRevision: options.registry.getSnapshot().revision,
          manifestContentHash: record.contentHash,
        };
      });
    },
  };
}

export async function createDefaultMotionSourceService() {
  const registry = createGlobalAssetRegistry({
    roots: (await import('../../../global-asset-registry/src/asset-catalog-roots.ts')).resolveAssetCatalogRootDescriptors(),
    strict: false,
  }) as GlobalAssetRegistryWithRecords;
  await registry.refresh();
  return createMotionAssetSourceService({ registry });
}

export type { AssetManifestV1 };
