export const ASSET_SCHEMA_VERSION = '1.0.0' as const;

export const ASSET_KINDS = [
  'primitive',
  'object',
  'character',
  'background',
  'ui',
  'diagram',
  'effect',
  'animation',
  'transition',
  'scene-template',
  'audio',
  'font',
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ['draft', 'staging', 'published', 'deprecated'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_IMPLEMENTATION_TYPES = [
  'svg',
  'react-component',
  'remotion-component',
  'lottie',
  'image',
  'audio',
  'font',
  'composite',
  'builtin',
] as const;

export type AssetImplementationType = (typeof ASSET_IMPLEMENTATION_TYPES)[number];

export const ASSET_PREVIEW_TYPES = ['image', 'video', 'audio'] as const;
export type AssetPreviewType = (typeof ASSET_PREVIEW_TYPES)[number];

export const ASSET_PROVENANCE_ORIGINS = ['user', 'agent', 'import', 'upstream'] as const;
export type AssetProvenanceOrigin = (typeof ASSET_PROVENANCE_ORIGINS)[number];

export type AssetImplementation = {
  type: AssetImplementationType;
  entry: string;
  exportName?: string;
};

export type AssetPreview = {
  type: AssetPreviewType;
  path: string;
  mimeType: string;
};

export type AssetLicense = {
  spdx: string;
  attribution?: string;
  sourceUrl?: string;
};

export type AssetProvenance = {
  origin: AssetProvenanceOrigin;
  sourceAssetId?: string;
  createdBy?: string;
};

export type AssetDeprecation = {
  reason: string;
  replacementAssetId?: string;
};

export type AssetManifestV1 = {
  schemaVersion: typeof ASSET_SCHEMA_VERSION;
  id: string;
  version: string;
  name: string;
  description: string;
  kind: AssetKind;
  status: AssetStatus;
  categories: string[];
  tags: string[];
  aliases?: string[];
  capabilities: string[];
  styleTags?: string[];
  implementation: AssetImplementation;
  propsSchema?: Record<string, unknown>;
  previews?: AssetPreview[];
  license: AssetLicense;
  provenance?: AssetProvenance;
  deprecation?: AssetDeprecation;
};

export type AssetManifestSummary = {
  id: string;
  version: string;
  name: string;
  description: string;
  kind: AssetKind;
  status: AssetStatus;
  categories: string[];
  tags: string[];
  capabilities: string[];
  styleTags: string[];
  implementationType: AssetImplementationType;
  preview?: { type: AssetPreviewType; mimeType: string };
  license: { spdx: string; attribution?: string };
  propsSchema?: Record<string, unknown>;
};

export type AssetValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type AssetValidationResult =
  | {
      success: true;
      manifest: AssetManifestV1;
      warnings: AssetValidationIssue[];
    }
  | {
      success: false;
      errors: AssetValidationIssue[];
      warnings: AssetValidationIssue[];
    };

export type AssetCatalogDiagnostic = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  file?: string;
  path?: string;
};

export type LoadAssetCatalogOptions = {
  roots: string[];
  strict?: boolean;
  verifyReferencedFiles?: boolean;
};

export type AssetCatalogLoadResult = {
  manifests: AssetManifestV1[];
  diagnostics: AssetCatalogDiagnostic[];
};

export type AssetRegistrySnapshot = {
  revision: string;
  assets: AssetManifestV1[];
  diagnostics: AssetCatalogDiagnostic[];
};

export type AssetSearchInput = {
  query?: string;
  kinds?: AssetKind[];
  categories?: string[];
  tags?: string[];
  capabilities?: string[];
  implementationTypes?: AssetImplementationType[];
  statuses?: AssetStatus[];
  includeDeprecated?: boolean;
  includePropsSchema?: boolean;
  limit?: number;
  offset?: number;
};

export type AssetSearchMatch = {
  asset: AssetManifestSummary;
  score: number;
  matchedFields: string[];
  matchReasons: string[];
};

export type AssetSearchResult = {
  catalogRevision: string;
  total: number;
  offset: number;
  limit: number;
  items: AssetSearchMatch[];
  diagnostics: AssetCatalogDiagnostic[];
};

export type GlobalAssetRegistry = {
  refresh(): Promise<AssetRegistrySnapshot>;
  getSnapshot(): AssetRegistrySnapshot;
  getAsset(id: string, version?: string): AssetManifestV1 | undefined;
  getVersions(id: string): AssetManifestV1[];
  search(input: AssetSearchInput): AssetSearchResult;
};
