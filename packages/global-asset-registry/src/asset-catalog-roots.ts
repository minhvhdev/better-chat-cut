import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export type AssetStorageScope = 'bundled' | 'user';

export type AssetCatalogRoot = {
  path: string;
  scope: AssetStorageScope;
  writable: boolean;
};

export function defaultBundledCatalogRoot(cwd = process.cwd()): string {
  const override = process.env.BETTER_CHAT_CUT_ASSET_CATALOG_ROOT?.trim();
  if (override) return resolve(cwd, override);
  return resolve(cwd, 'extensions', 'better-chat-cut', 'catalog', 'manifests');
}

export function defaultUserCatalogRoot(): string {
  const override = process.env.BETTER_CHAT_CUT_USER_ASSET_CATALOG_ROOT?.trim();
  if (override) return resolve(override);
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'assets', 'manifests');
}

export function resolveAssetCatalogRootDescriptors(cwd = process.cwd()): AssetCatalogRoot[] {
  return [
    {
      path: defaultBundledCatalogRoot(cwd),
      scope: 'bundled',
      writable: false,
    },
    {
      path: defaultUserCatalogRoot(),
      scope: 'user',
      writable: true,
    },
  ];
}

export function resolveWritableAssetCatalogRoot(cwd = process.cwd()): AssetCatalogRoot {
  const writable = resolveAssetCatalogRootDescriptors(cwd).find((root) => root.writable);
  if (!writable) {
    throw new Error('No writable Better Chat Cut asset catalog root is configured');
  }
  return writable;
}

/** Backward-compatible path list used by M1A callers. */
export function resolveAssetCatalogRoots(cwd = process.cwd()): string[] {
  return resolveAssetCatalogRootDescriptors(cwd).map((root) => root.path);
}
