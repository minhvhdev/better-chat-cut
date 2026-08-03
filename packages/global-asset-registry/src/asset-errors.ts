export class AssetRegistryError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'AssetRegistryError';
    this.code = code;
    this.field = field;
  }
}

export const ASSET_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const SCORE_WEIGHTS = {
  exactId: 1000,
  exactName: 900,
  exactAlias: 850,
  idToken: 700,
  nameToken: 650,
  capability: 600,
  tag: 500,
  aliasToken: 450,
  category: 400,
  styleTag: 350,
  descriptionToken: 200,
} as const;

export const STATUS_PRIORITY: Record<string, number> = {
  published: 3,
  staging: 2,
  draft: 1,
  deprecated: 0,
};

export const DEFAULT_SEARCH_LIMIT = 20;
export const MIN_SEARCH_LIMIT = 1;
export const MAX_SEARCH_LIMIT = 50;
