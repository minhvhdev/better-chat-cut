import { compareSemverDesc } from './asset-normalization.ts';
import { computeCatalogRevision, loadAssetCatalog } from './asset-loader.ts';
import { searchAssets } from './asset-search.ts';
import { computeAssetContentHash } from './asset-hash.ts';
import type {
  AssetDetail,
  AssetManifestV1,
  AssetRegistryRecord,
  AssetRegistrySnapshot,
  AssetSearchInput,
  AssetSearchResult,
  GlobalAssetRegistry,
  LoadAssetCatalogOptions,
} from './asset-types.ts';

export type CreateGlobalAssetRegistryOptions = {
  roots: LoadAssetCatalogOptions['roots'];
  strict?: boolean;
  verifyReferencedFiles?: boolean;
};

export type GlobalAssetRegistryWithRecords = GlobalAssetRegistry & {
  getRecords(): AssetRegistryRecord[];
  getDetail(id: string, version?: string): AssetDetail | null;
};

function pickPreferredVersion(versions: AssetManifestV1[]): AssetManifestV1 | undefined {
  const published = versions
    .filter((item) => item.status === 'published')
    .sort((a, b) => compareSemverDesc(a.version, b.version));
  if (published[0]) return published[0];
  const staging = versions
    .filter((item) => item.status === 'staging')
    .sort((a, b) => compareSemverDesc(a.version, b.version));
  return staging[0];
}

export function createGlobalAssetRegistry(
  options: CreateGlobalAssetRegistryOptions,
): GlobalAssetRegistryWithRecords {
  let snapshot: AssetRegistrySnapshot = {
    revision: computeCatalogRevision([]),
    assets: [],
    diagnostics: [],
  };
  let records: AssetRegistryRecord[] = [];

  const loadOptions = (): LoadAssetCatalogOptions => ({
    roots: options.roots,
    strict: options.strict === true,
    verifyReferencedFiles: options.verifyReferencedFiles === true,
  });

  return {
    async refresh(): Promise<AssetRegistrySnapshot> {
      const loaded = await loadAssetCatalog(loadOptions());
      records = loaded.records;
      snapshot = {
        revision: computeCatalogRevision(loaded.manifests),
        assets: loaded.manifests,
        diagnostics: loaded.diagnostics,
      };
      return snapshot;
    },

    getSnapshot(): AssetRegistrySnapshot {
      return snapshot;
    },

    getRecords(): AssetRegistryRecord[] {
      return records;
    },

    getAsset(id: string, version?: string): AssetManifestV1 | undefined {
      const versions = snapshot.assets.filter((asset) => asset.id === id);
      if (!versions.length) return undefined;
      if (version) return versions.find((asset) => asset.version === version);
      return pickPreferredVersion(versions);
    },

    getVersions(id: string): AssetManifestV1[] {
      return snapshot.assets
        .filter((asset) => asset.id === id)
        .sort((a, b) => compareSemverDesc(a.version, b.version));
    },

    getDetail(id: string, version?: string): AssetDetail | null {
      const versions = records.filter((record) => record.manifest.id === id);
      if (!versions.length) return null;
      const record = version
        ? versions.find((item) => item.manifest.version === version)
        : (() => {
          const preferred = pickPreferredVersion(versions.map((item) => item.manifest));
          return preferred
            ? versions.find((item) => item.manifest.version === preferred.version)
            : undefined;
        })();
      if (!record) return null;
      return {
        manifest: record.manifest,
        contentHash: record.contentHash || computeAssetContentHash(record.manifest),
        catalogRevision: snapshot.revision,
        storageScope: record.storageScope,
        writable: record.writable,
      };
    },

    search(input: AssetSearchInput): AssetSearchResult {
      return searchAssets(snapshot.assets, input, snapshot.revision, snapshot.diagnostics);
    },
  };
}
