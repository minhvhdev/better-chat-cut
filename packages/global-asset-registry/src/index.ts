export type {
  AssetCatalogDiagnostic,
  AssetDetail,
  AssetImplementationType,
  AssetKind,
  AssetManifestSummary,
  AssetManifestV1,
  AssetRegistryRecord,
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
export {
  resolveAssetCatalogRootDescriptors,
  resolveWritableAssetCatalogRoot,
} from './asset-catalog-roots.ts';
export { createGlobalAssetRegistry } from './asset-registry.ts';
export { normalizeAssetSearchText } from './asset-normalization.ts';
export { AssetRegistryError } from './asset-errors.ts';
export { computeAssetContentHash } from './asset-hash.ts';
export { findSimilarAssets } from './asset-similarity.ts';
export { createAssetCatalogWriter } from './asset-writer.ts';
