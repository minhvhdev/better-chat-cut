export type {
  AssetCatalogDiagnostic,
  AssetImplementationType,
  AssetKind,
  AssetManifestSummary,
  AssetManifestV1,
  AssetSearchInput,
  AssetSearchResult,
  AssetStatus,
  GlobalAssetRegistry,
} from './asset-types.ts';

export { validateAssetManifest } from './asset-validator.ts';
export {
  computeCatalogRevision,
  loadAssetCatalog,
  resolveAssetCatalogRoots,
} from './asset-loader.ts';
export { createGlobalAssetRegistry } from './asset-registry.ts';
export { normalizeAssetSearchText } from './asset-normalization.ts';
export { AssetRegistryError } from './asset-errors.ts';
