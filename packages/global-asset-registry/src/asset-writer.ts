import { mkdir, open, rename, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AssetRegistryError } from './asset-errors.ts';
import { resolveWritableAssetCatalogRoot, type AssetCatalogRoot } from './asset-catalog-roots.ts';
import { computeAssetContentHash, serializeManifestFile } from './asset-hash.ts';
import { compareSemverDesc } from './asset-normalization.ts';
import { findSimilarAssets, type AssetSimilarityResult } from './asset-similarity.ts';
import { validateAssetManifest } from './asset-validator.ts';
import type {
  AssetManifestV1,
  AssetRegistryRecord,
  AssetStatus,
  AssetValidationIssue,
  GlobalAssetRegistry,
} from './asset-types.ts';

const ALLOWED_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  draft: ['staging'],
  staging: ['draft', 'published'],
  published: ['deprecated'],
  deprecated: [],
};

export type AssetWriteGuard = {
  requestId: string;
  expectedCatalogRevision: string;
  dryRun?: boolean;
};

export type AssetWritePlan = {
  operation: 'create-draft' | 'update-draft' | 'transition-status';
  dryRun: true;
  currentCatalogRevision: string;
  predictedManifest: AssetManifestV1;
  predictedContentHash: string;
  relativeManifestPath: string;
  duplicateReport: AssetSimilarityResult;
  validationIssues: AssetValidationIssue[];
  warnings: AssetValidationIssue[];
};

export type AssetOperationReceipt = {
  requestId: string;
  operation: 'create-draft' | 'update-draft' | 'transition-status';
  catalogRevisionBefore: string;
  catalogRevisionAfter: string;
  contentHash: string;
  relativeManifestPath: string;
  assetId: string;
  assetVersion: string;
};

export type AssetWriteResult =
  | {
      applied: false;
      dryRun: true;
      plan: AssetWritePlan;
    }
  | {
      applied: true;
      dryRun: false;
      receipt: AssetOperationReceipt;
      asset: {
        manifest: AssetManifestV1;
        contentHash: string;
        storageScope: 'user';
        writable: true;
      };
      catalogRevision: string;
      duplicateReport: AssetSimilarityResult;
    };

type CreateDraftInput = AssetWriteGuard & {
  manifest: unknown;
  basedOn?: { id: string; version: string };
  duplicateOverride?: { reason: string };
};

type UpdateDraftInput = AssetWriteGuard & {
  expectedContentHash: string;
  manifest: unknown;
  duplicateOverride?: { reason: string };
};

type TransitionInput = AssetWriteGuard & {
  expectedContentHash: string;
  id: string;
  version: string;
  targetStatus: AssetStatus;
  deprecation?: { reason: string; replacementAssetId?: string; replacementAssetVersion?: string };
  duplicateOverride?: { reason: string };
};

function relativePathFor(manifest: AssetManifestV1): string {
  return `${manifest.id}/${manifest.version}.asset.json`;
}

function requireRevision(registry: GlobalAssetRegistry, expected: string): string {
  const current = registry.getSnapshot().revision;
  if (current !== expected) {
    throw new AssetRegistryError(
      'CATALOG_REVISION_CONFLICT',
      `Catalog revision mismatch. expected=${expected} current=${current}. Call asset_search/asset_get and retry.`,
      'expectedCatalogRevision',
    );
  }
  return current;
}

function ensureDraft(manifest: AssetManifestV1): void {
  if (manifest.status !== 'draft') {
    throw new AssetRegistryError('invalid_status', 'Create/update draft requires status=draft', 'status');
  }
}

function requireMeaningfulReason(reason: string, field: string): void {
  if (!reason || reason.trim().length < 3) {
    throw new AssetRegistryError('invalid_deprecation', `${field} must be a meaningful non-empty string`, field);
  }
}

async function withCatalogLock<T>(root: AssetCatalogRoot, fn: () => Promise<T>): Promise<T> {
  const metaDir = join(root.path, '_meta');
  await mkdir(metaDir, { recursive: true });
  const lockPath = join(metaDir, 'catalog.lock');
  const handle = await open(lockPath, 'w');
  try {
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    return await fn();
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function atomicWriteManifest(rootPath: string, relativePath: string, manifest: AssetManifestV1): Promise<void> {
  const target = join(rootPath, relativePath);
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, serializeManifestFile(manifest), 'utf8');
  await rename(temp, target);
}

async function appendEvent(rootPath: string, event: Record<string, unknown>): Promise<void> {
  const metaDir = join(rootPath, '_meta');
  await mkdir(metaDir, { recursive: true });
  await appendFile(join(metaDir, 'catalog-events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

function findRecord(
  records: AssetRegistryRecord[],
  id: string,
  version?: string,
): AssetRegistryRecord | undefined {
  const versions = records.filter((record) => record.manifest.id === id);
  if (!versions.length) return undefined;
  if (version) return versions.find((record) => record.manifest.version === version);
  const published = versions
    .filter((record) => record.manifest.status === 'published')
    .sort((a, b) => compareSemverDesc(a.manifest.version, b.manifest.version));
  if (published[0]) return published[0];
  const staging = versions
    .filter((record) => record.manifest.status === 'staging')
    .sort((a, b) => compareSemverDesc(a.manifest.version, b.manifest.version));
  return staging[0];
}

export function createAssetCatalogWriter(registry: GlobalAssetRegistry & {
  getRecords(): AssetRegistryRecord[];
}) {
  const writableRoot = resolveWritableAssetCatalogRoot();

  async function prepareCreate(input: CreateDraftInput): Promise<{
    manifest: AssetManifestV1;
    warnings: AssetValidationIssue[];
    duplicateReport: AssetSimilarityResult;
    relativeManifestPath: string;
    currentRevision: string;
  }> {
    if (!input.requestId?.trim()) {
      throw new AssetRegistryError('invalid_request', 'requestId is required', 'requestId');
    }
    const currentRevision = requireRevision(registry, input.expectedCatalogRevision);
    const validated = validateAssetManifest(input.manifest);
    if (!validated.success) {
      throw new AssetRegistryError(
        'invalid_manifest',
        validated.errors.map((error) => `${error.path}: ${error.message}`).join('; '),
        'manifest',
      );
    }
    ensureDraft(validated.manifest);

    const records = registry.getRecords();
    const sameId = records.filter((record) => record.manifest.id === validated.manifest.id);
    if (sameId.length) {
      if (!input.basedOn) {
        throw new AssetRegistryError(
          'based_on_required',
          `Asset id ${validated.manifest.id} already exists; pass basedOn to create a new version`,
          'basedOn',
        );
      }
      const base = findRecord(records, input.basedOn.id, input.basedOn.version);
      if (!base) {
        throw new AssetRegistryError('based_on_missing', 'basedOn asset was not found', 'basedOn');
      }
      if (base.manifest.id !== validated.manifest.id) {
        throw new AssetRegistryError('based_on_id_mismatch', 'basedOn.id must match manifest.id', 'basedOn');
      }
      if (compareSemverDesc(validated.manifest.version, base.manifest.version) <= 0) {
        throw new AssetRegistryError(
          'version_not_greater',
          'New draft version must be greater than basedOn.version',
          'version',
        );
      }
    }
    if (sameId.some((record) => record.manifest.version === validated.manifest.version)) {
      throw new AssetRegistryError('version_exists', 'Asset id@version already exists', 'version');
    }

    const duplicateReport = findSimilarAssets(
      registry.getSnapshot().assets,
      {
        id: validated.manifest.id,
        version: validated.manifest.version,
        name: validated.manifest.name,
        description: validated.manifest.description,
        kind: validated.manifest.kind,
        categories: validated.manifest.categories,
        tags: validated.manifest.tags,
        aliases: validated.manifest.aliases,
        capabilities: validated.manifest.capabilities,
        styleTags: validated.manifest.styleTags,
      },
      currentRevision,
    );
    const blocking = duplicateReport.items.filter((item) => item.level === 'exact' || item.level === 'likely');
    if (blocking.length && !input.duplicateOverride?.reason) {
      throw new AssetRegistryError(
        'duplicate_likely',
        'Likely duplicate assets found. Call asset_find_similar or pass duplicateOverride.reason',
        'duplicateOverride',
      );
    }

    return {
      manifest: validated.manifest,
      warnings: validated.warnings,
      duplicateReport,
      relativeManifestPath: relativePathFor(validated.manifest),
      currentRevision,
    };
  }

  return {
    async createDraft(input: CreateDraftInput): Promise<AssetWriteResult> {
      const prepared = await prepareCreate(input);
      const dryRun = input.dryRun !== false;
      const contentHash = computeAssetContentHash(prepared.manifest);
      if (dryRun) {
        return {
          applied: false,
          dryRun: true,
          plan: {
            operation: 'create-draft',
            dryRun: true,
            currentCatalogRevision: prepared.currentRevision,
            predictedManifest: prepared.manifest,
            predictedContentHash: contentHash,
            relativeManifestPath: prepared.relativeManifestPath,
            duplicateReport: prepared.duplicateReport,
            validationIssues: [],
            warnings: prepared.warnings,
          },
        };
      }

      return withCatalogLock(writableRoot, async () => {
        await registry.refresh();
        const again = await prepareCreate(input);
        await atomicWriteManifest(writableRoot.path, again.relativeManifestPath, again.manifest);
        await appendEvent(writableRoot.path, {
          type: 'create-draft',
          requestId: input.requestId,
          id: again.manifest.id,
          version: again.manifest.version,
          at: new Date().toISOString(),
        });
        const snap = await registry.refresh();
        const hash = computeAssetContentHash(again.manifest);
        return {
          applied: true,
          dryRun: false,
          receipt: {
            requestId: input.requestId,
            operation: 'create-draft',
            catalogRevisionBefore: again.currentRevision,
            catalogRevisionAfter: snap.revision,
            contentHash: hash,
            relativeManifestPath: again.relativeManifestPath,
            assetId: again.manifest.id,
            assetVersion: again.manifest.version,
          },
          asset: {
            manifest: again.manifest,
            contentHash: hash,
            storageScope: 'user',
            writable: true,
          },
          catalogRevision: snap.revision,
          duplicateReport: again.duplicateReport,
        };
      });
    },

    async updateDraft(input: UpdateDraftInput): Promise<AssetWriteResult> {
      if (!input.requestId?.trim()) {
        throw new AssetRegistryError('invalid_request', 'requestId is required', 'requestId');
      }
      const currentRevision = requireRevision(registry, input.expectedCatalogRevision);
      const validated = validateAssetManifest(input.manifest);
      if (!validated.success) {
        throw new AssetRegistryError(
          'invalid_manifest',
          validated.errors.map((error) => `${error.path}: ${error.message}`).join('; '),
          'manifest',
        );
      }
      ensureDraft(validated.manifest);
      const existing = findRecord(registry.getRecords(), validated.manifest.id, validated.manifest.version);
      if (!existing) throw new AssetRegistryError('not_found', 'Draft asset was not found', 'manifest');
      if (!existing.writable || existing.storageScope !== 'user') {
        throw new AssetRegistryError('not_writable', 'Bundled assets cannot be updated', 'manifest');
      }
      if (existing.manifest.status !== 'draft') {
        throw new AssetRegistryError('not_draft', 'Only draft assets can be updated', 'status');
      }
      if (existing.contentHash !== input.expectedContentHash) {
        throw new AssetRegistryError(
          'ASSET_CONTENT_CONFLICT',
          'Asset content hash mismatch. Re-read with asset_get and retry.',
          'expectedContentHash',
        );
      }
      if (
        validated.manifest.schemaVersion !== existing.manifest.schemaVersion
        || validated.manifest.id !== existing.manifest.id
        || validated.manifest.version !== existing.manifest.version
      ) {
        throw new AssetRegistryError('immutable_identity', 'schemaVersion/id/version cannot change on update', 'manifest');
      }

      const duplicateReport = findSimilarAssets(
        registry.getSnapshot().assets.filter((asset) => !(asset.id === validated.manifest.id && asset.version === validated.manifest.version)),
        {
          id: validated.manifest.id,
          name: validated.manifest.name,
          description: validated.manifest.description,
          kind: validated.manifest.kind,
          categories: validated.manifest.categories,
          tags: validated.manifest.tags,
          aliases: validated.manifest.aliases,
          capabilities: validated.manifest.capabilities,
          styleTags: validated.manifest.styleTags,
        },
        currentRevision,
      );
      if (duplicateReport.items.some((item) => item.level === 'exact' || item.level === 'likely') && !input.duplicateOverride?.reason) {
        throw new AssetRegistryError('duplicate_likely', 'Likely duplicates found; pass duplicateOverride.reason', 'duplicateOverride');
      }

      const relativeManifestPath = existing.relativeManifestPath || relativePathFor(validated.manifest);
      const contentHash = computeAssetContentHash(validated.manifest);
      const dryRun = input.dryRun !== false;
      if (dryRun) {
        return {
          applied: false,
          dryRun: true,
          plan: {
            operation: 'update-draft',
            dryRun: true,
            currentCatalogRevision: currentRevision,
            predictedManifest: validated.manifest,
            predictedContentHash: contentHash,
            relativeManifestPath,
            duplicateReport,
            validationIssues: [],
            warnings: validated.warnings,
          },
        };
      }

      return withCatalogLock(writableRoot, async () => {
        await registry.refresh();
        requireRevision(registry, input.expectedCatalogRevision);
        const again = findRecord(registry.getRecords(), validated.manifest.id, validated.manifest.version);
        if (!again || again.contentHash !== input.expectedContentHash) {
          throw new AssetRegistryError('ASSET_CONTENT_CONFLICT', 'Asset changed during write', 'expectedContentHash');
        }
        await atomicWriteManifest(writableRoot.path, relativeManifestPath, validated.manifest);
        await appendEvent(writableRoot.path, {
          type: 'update-draft',
          requestId: input.requestId,
          id: validated.manifest.id,
          version: validated.manifest.version,
          at: new Date().toISOString(),
        });
        const snap = await registry.refresh();
        return {
          applied: true,
          dryRun: false,
          receipt: {
            requestId: input.requestId,
            operation: 'update-draft',
            catalogRevisionBefore: currentRevision,
            catalogRevisionAfter: snap.revision,
            contentHash,
            relativeManifestPath,
            assetId: validated.manifest.id,
            assetVersion: validated.manifest.version,
          },
          asset: {
            manifest: validated.manifest,
            contentHash,
            storageScope: 'user',
            writable: true,
          },
          catalogRevision: snap.revision,
          duplicateReport,
        };
      });
    },

    async transitionStatus(input: TransitionInput): Promise<AssetWriteResult> {
      if (!input.requestId?.trim()) {
        throw new AssetRegistryError('invalid_request', 'requestId is required', 'requestId');
      }
      const currentRevision = requireRevision(registry, input.expectedCatalogRevision);
      const existing = findRecord(registry.getRecords(), input.id, input.version);
      if (!existing) throw new AssetRegistryError('not_found', 'Asset was not found', 'id');
      if (!existing.writable || existing.storageScope !== 'user') {
        throw new AssetRegistryError('not_writable', 'Bundled assets cannot transition in M1B', 'id');
      }
      if (existing.contentHash !== input.expectedContentHash) {
        throw new AssetRegistryError('ASSET_CONTENT_CONFLICT', 'Asset content hash mismatch', 'expectedContentHash');
      }
      const allowed = ALLOWED_TRANSITIONS[existing.manifest.status] ?? [];
      if (!allowed.includes(input.targetStatus)) {
        throw new AssetRegistryError(
          'invalid_transition',
          `Cannot transition ${existing.manifest.status} → ${input.targetStatus}`,
          'targetStatus',
        );
      }

      const next: AssetManifestV1 = {
        ...existing.manifest,
        status: input.targetStatus,
      };
      if (input.targetStatus === 'deprecated') {
        requireMeaningfulReason(input.deprecation?.reason ?? '', 'deprecation.reason');
        if (input.deprecation?.replacementAssetId) {
          const replacement = findRecord(
            registry.getRecords(),
            input.deprecation.replacementAssetId,
            input.deprecation.replacementAssetVersion,
          );
          if (!replacement || replacement.manifest.status !== 'published') {
            throw new AssetRegistryError('invalid_replacement', 'replacement must exist and be published', 'deprecation');
          }
          if (
            replacement.manifest.id === existing.manifest.id
            && replacement.manifest.version === existing.manifest.version
          ) {
            throw new AssetRegistryError('invalid_replacement', 'replacement cannot point to itself', 'deprecation');
          }
        }
        next.deprecation = {
          reason: input.deprecation!.reason.trim(),
          ...(input.deprecation?.replacementAssetId
            ? { replacementAssetId: input.deprecation.replacementAssetId }
            : {}),
        };
      } else {
        delete next.deprecation;
      }

      const validated = validateAssetManifest(next);
      if (!validated.success) {
        throw new AssetRegistryError(
          'invalid_manifest',
          validated.errors.map((error) => `${error.path}: ${error.message}`).join('; '),
          'manifest',
        );
      }

      const relativeManifestPath = existing.relativeManifestPath || relativePathFor(validated.manifest);
      const contentHash = computeAssetContentHash(validated.manifest);
      const duplicateReport = findSimilarAssets(registry.getSnapshot().assets, {
        id: validated.manifest.id,
        name: validated.manifest.name,
        kind: validated.manifest.kind,
        categories: validated.manifest.categories,
        tags: validated.manifest.tags,
        aliases: validated.manifest.aliases,
        capabilities: validated.manifest.capabilities,
      }, currentRevision);
      const dryRun = input.dryRun !== false;
      if (dryRun) {
        return {
          applied: false,
          dryRun: true,
          plan: {
            operation: 'transition-status',
            dryRun: true,
            currentCatalogRevision: currentRevision,
            predictedManifest: validated.manifest,
            predictedContentHash: contentHash,
            relativeManifestPath,
            duplicateReport,
            validationIssues: [],
            warnings: validated.warnings,
          },
        };
      }

      return withCatalogLock(writableRoot, async () => {
        await registry.refresh();
        requireRevision(registry, input.expectedCatalogRevision);
        const again = findRecord(registry.getRecords(), input.id, input.version);
        if (!again || again.contentHash !== input.expectedContentHash) {
          throw new AssetRegistryError('ASSET_CONTENT_CONFLICT', 'Asset changed during transition', 'expectedContentHash');
        }
        await atomicWriteManifest(writableRoot.path, relativeManifestPath, validated.manifest);
        await appendEvent(writableRoot.path, {
          type: 'transition-status',
          requestId: input.requestId,
          id: validated.manifest.id,
          version: validated.manifest.version,
          from: existing.manifest.status,
          to: validated.manifest.status,
          at: new Date().toISOString(),
        });
        const snap = await registry.refresh();
        return {
          applied: true,
          dryRun: false,
          receipt: {
            requestId: input.requestId,
            operation: 'transition-status',
            catalogRevisionBefore: currentRevision,
            catalogRevisionAfter: snap.revision,
            contentHash,
            relativeManifestPath,
            assetId: validated.manifest.id,
            assetVersion: validated.manifest.version,
          },
          asset: {
            manifest: validated.manifest,
            contentHash,
            storageScope: 'user',
            writable: true,
          },
          catalogRevision: snap.revision,
          duplicateReport,
        };
      });
    },
  };
}
