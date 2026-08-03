import { compareSemverDesc } from './asset-normalization.ts';
import { computeCatalogRevision, loadAssetCatalog } from './asset-loader.ts';
import { searchAssets } from './asset-search.ts';
import type {
  AssetCatalogDiagnostic,
  AssetManifestV1,
  AssetRegistrySnapshot,
  AssetSearchInput,
  AssetSearchResult,
  GlobalAssetRegistry,
  LoadAssetCatalogOptions,
} from './asset-types.ts';

export type CreateGlobalAssetRegistryOptions = {
  roots: string[];
  strict?: boolean;
  verifyReferencedFiles?: boolean;
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
): GlobalAssetRegistry {
  let snapshot: AssetRegistrySnapshot = {
    revision: computeCatalogRevision([]),
    assets: [],
    diagnostics: [],
  };

  const loadOptions = (): LoadAssetCatalogOptions => ({
    roots: options.roots,
    strict: options.strict === true,
    verifyReferencedFiles: options.verifyReferencedFiles === true,
  });

  return {
    async refresh(): Promise<AssetRegistrySnapshot> {
      const loaded = await loadAssetCatalog(loadOptions());
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

    search(input: AssetSearchInput): AssetSearchResult {
      return searchAssets(snapshot.assets, input, snapshot.revision, snapshot.diagnostics);
    },
  };
}

export type { AssetCatalogDiagnostic };
