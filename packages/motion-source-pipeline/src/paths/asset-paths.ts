import { realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { MotionSourceError } from '../errors.ts';
import { SOURCE_FILE_NAME } from '../constants.ts';

const SAFE_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
const SAFE_HASH = /^[a-f0-9]{16,128}$/;
const SAFE_REQUEST = /^[a-zA-Z0-9._-]{1,128}$/;

function assertSafeSegment(value: string, label: string, pattern: RegExp): string {
  const trimmed = value.trim();
  if (!pattern.test(trimmed) || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new MotionSourceError(
      'MOTION_SOURCE_NOT_WRITABLE',
      `Unsafe ${label}`,
      { recovery: `Provide a valid ${label} without path separators or traversal.` },
    );
  }
  return trimmed;
}

export function assertSafeAssetId(assetId: string): string {
  return assertSafeSegment(assetId, 'assetId', SAFE_ID);
}

export function assertSafeAssetVersion(version: string): string {
  return assertSafeSegment(version, 'assetVersion', SAFE_VERSION);
}

export function assertSafeBuildHash(buildHash: string): string {
  return assertSafeSegment(buildHash, 'buildHash', SAFE_HASH);
}

export function assertSafeRequestId(requestId: string): string {
  return assertSafeSegment(requestId, 'requestId', SAFE_REQUEST);
}

export function ensureInsideRoot(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const rootWithSep = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(rootWithSep)) {
    throw new MotionSourceError(
      'MOTION_SOURCE_NOT_WRITABLE',
      'Resolved path escapes catalog root',
      { recovery: 'Do not pass paths; use assetId and assetVersion only.' },
    );
  }
  try {
    const realRoot = realpathSync(resolvedRoot);
    // If candidate does not exist yet, only check parent.
    let probe = resolvedCandidate;
    while (true) {
      try {
        const realProbe = realpathSync(probe);
        const realRootSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
        if (realProbe !== realRoot && !realProbe.startsWith(realRootSep)) {
          throw new MotionSourceError(
            'MOTION_SOURCE_NOT_WRITABLE',
            'Symlink escape outside catalog root',
          );
        }
        break;
      } catch (error) {
        if (error instanceof MotionSourceError) throw error;
        const parent = dirname(probe);
        if (parent === probe) break;
        probe = parent;
      }
    }
  } catch (error) {
    if (error instanceof MotionSourceError) throw error;
  }
  return resolvedCandidate;
}

export type MotionAssetPaths = {
  assetRoot: string;
  manifestRelative: string;
  manifestAbsolute: string;
  versionRoot: string;
  sourceFile: string;
  runtimeDir: (buildHash: string) => string;
  componentJs: (buildHash: string) => string;
  runtimeDescriptor: (buildHash: string) => string;
  buildReceipt: (buildHash: string) => string;
  previewDir: (buildHash: string) => string;
  stillPreview: (buildHash: string) => string;
  contactSheetPreview: (buildHash: string) => string;
  metaDir: string;
  sourceEvents: string;
  sourceOperationsDir: string;
};

export function resolveMotionAssetPaths(userCatalogRoot: string, assetId: string, assetVersion: string): MotionAssetPaths {
  const id = assertSafeAssetId(assetId);
  const version = assertSafeAssetVersion(assetVersion);
  const root = resolve(userCatalogRoot);
  const assetRoot = ensureInsideRoot(root, join(root, id));
  const versionRoot = ensureInsideRoot(root, join(assetRoot, version));
  const manifestRelative = `${id}/${version}.asset.json`;
  const manifestAbsolute = ensureInsideRoot(root, join(root, id, `${version}.asset.json`));
  const metaDir = ensureInsideRoot(root, join(versionRoot, '_meta'));

  return {
    assetRoot,
    manifestRelative,
    manifestAbsolute,
    versionRoot,
    sourceFile: ensureInsideRoot(root, join(versionRoot, 'source', SOURCE_FILE_NAME)),
    runtimeDir: (buildHash) => ensureInsideRoot(root, join(versionRoot, 'runtime', assertSafeBuildHash(buildHash))),
    componentJs: (buildHash) => ensureInsideRoot(root, join(versionRoot, 'runtime', assertSafeBuildHash(buildHash), 'component.js')),
    runtimeDescriptor: (buildHash) => ensureInsideRoot(root, join(versionRoot, 'runtime', assertSafeBuildHash(buildHash), 'runtime-descriptor.json')),
    buildReceipt: (buildHash) => ensureInsideRoot(root, join(versionRoot, 'runtime', assertSafeBuildHash(buildHash), 'build-receipt.json')),
    previewDir: (buildHash) => ensureInsideRoot(root, join(versionRoot, 'previews', assertSafeBuildHash(buildHash))),
    stillPreview: (buildHash) => ensureInsideRoot(root, join(versionRoot, 'previews', assertSafeBuildHash(buildHash), 'still.png')),
    contactSheetPreview: (buildHash) => ensureInsideRoot(root, join(versionRoot, 'previews', assertSafeBuildHash(buildHash), 'contact-sheet.png')),
    metaDir,
    sourceEvents: ensureInsideRoot(root, join(metaDir, 'source-events.jsonl')),
    sourceOperationsDir: ensureInsideRoot(root, join(metaDir, 'source-operations')),
  };
}
