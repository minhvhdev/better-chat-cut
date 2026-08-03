import { readFile } from 'node:fs/promises';
import {
  resolveWritableAssetCatalogRoot,
  type AssetRegistryRecord,
} from '../../../global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../global-asset-registry/src/asset-registry.ts';
import {
  MOTION_RUNTIME_CONTRACT_VERSION,
  MOTION_SANDBOX_CONTRACT_VERSION,
} from '../constants.ts';
import type { UserMotionRuntimeDescriptor } from '../contracts/types.ts';
import { computeMotionImplementationFingerprint } from '../hashes.ts';
import { resolveMotionAssetPaths } from '../paths/asset-paths.ts';
import {
  getMotionComponent,
  registerMotionComponent,
} from '../../../motion-components/src/runtime/registry.ts';
import type {
  MotionComponentDefinition,
  MotionKind,
} from '../../../motion-components/src/contracts/motion-types.ts';

/**
 * Load verified (staging/published) user motion runtimes into the composite registry.
 * Bundles are stored as strings — evaluation happens only in Remotion Chromium.
 */
export async function refreshVerifiedUserMotionRuntimes(options: {
  registry: GlobalAssetRegistryWithRecords;
  userCatalogRoot?: string;
}): Promise<{ loaded: string[]; skipped: Array<{ id: string; reason: string }> }> {
  const userRoot = options.userCatalogRoot ?? resolveWritableAssetCatalogRoot().path;
  await options.registry.refresh();
  const loaded: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  const candidates = options.registry.getRecords().filter((record) => (
    record.storageScope === 'user'
    && (record.manifest.status === 'staging' || record.manifest.status === 'published')
    && (record.manifest.implementation.type === 'react-component'
      || record.manifest.implementation.type === 'remotion-component')
    && record.manifest.implementation.entry.startsWith('runtime/')
  ));

  for (const record of candidates) {
    const key = `${record.manifest.id}@${record.manifest.version}`;
    try {
      const definition = await loadVerifiedDefinition(userRoot, record);
      registerMotionComponent(definition);
      loaded.push(key);
    } catch (error) {
      skipped.push({
        id: key,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { loaded, skipped };
}

async function loadVerifiedDefinition(
  userRoot: string,
  record: AssetRegistryRecord,
): Promise<MotionComponentDefinition> {
  const entry = record.manifest.implementation.entry;
  const match = /^runtime\/([a-f0-9]+)\/component\.js$/.exec(entry);
  if (!match) {
    throw new Error('implementation.entry is not a runtime build path');
  }
  const buildHash = match[1];
  const paths = resolveMotionAssetPaths(userRoot, record.manifest.id, record.manifest.version);
  const descriptor = JSON.parse(
    await readFile(paths.runtimeDescriptor(buildHash), 'utf8'),
  ) as UserMotionRuntimeDescriptor;
  const code = await readFile(paths.componentJs(buildHash), 'utf8');

  if (descriptor.buildHash !== buildHash) throw new Error('descriptor buildHash mismatch');
  if (descriptor.assetId !== record.manifest.id) throw new Error('descriptor assetId mismatch');
  if (descriptor.exportName !== record.manifest.implementation.exportName) {
    throw new Error('exportName mismatch');
  }
  if (descriptor.sandboxContractVersion !== MOTION_SANDBOX_CONTRACT_VERSION) {
    throw new Error('unsupported sandbox contract');
  }
  if (descriptor.runtimeContractVersion !== MOTION_RUNTIME_CONTRACT_VERSION) {
    throw new Error('unsupported runtime contract');
  }
  if (descriptor.bundleByteLength !== Buffer.byteLength(code, 'utf8')) {
    throw new Error('bundle size mismatch');
  }

  const fingerprint = computeMotionImplementationFingerprint(record.manifest);
  if (descriptor.implementationFingerprint !== fingerprint) {
    // Allow status-only drift: recompute against current implementation fields.
    // If implementation fields changed without rebuild, reject.
    throw new Error('implementation fingerprint mismatch');
  }

  // Source must still match when present
  try {
    const source = await readFile(paths.sourceFile, 'utf8');
    const { computeSourceHash } = await import('../hashes.ts');
    if (computeSourceHash(source) !== descriptor.sourceHash) {
      throw new Error('source hash no longer matches descriptor');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('source hash')) throw error;
    // Source may be absent after future policies; for M2B require it.
    throw new Error('source missing for verified runtime');
  }

  // Previews must exist
  await readFile(paths.stillPreview(buildHash));
  await readFile(paths.contactSheetPreview(buildHash));

  const defaults: Record<string, unknown> = {};
  const schema = record.manifest.propsSchema;
  if (schema?.properties && typeof schema.properties === 'object') {
    for (const [key, rule] of Object.entries(schema.properties as Record<string, { default?: unknown }>)) {
      if (rule && typeof rule === 'object' && 'default' in rule) defaults[key] = rule.default;
    }
  }

  return {
    assetId: record.manifest.id,
    assetVersion: record.manifest.version,
    displayName: record.manifest.name,
    description: record.manifest.description,
    kind: record.manifest.kind as MotionKind,
    sandboxedBundle: {
      code,
      exportName: descriptor.exportName,
      buildHash,
      sourceHash: descriptor.sourceHash,
    },
    defaultProps: defaults,
    propsSchema: record.manifest.propsSchema,
    preview: {
      width: 640,
      height: 360,
      fps: 30,
      durationInFrames: 45,
      stillFrame: 15,
      contactSheetFrames: [0, 12, 24, 36, 44],
    },
    supportedThemes: ['default', 'high-contrast'],
  };
}

export function inspectCandidateAvailability(options: {
  registry: GlobalAssetRegistryWithRecords;
  userCatalogRoot?: string;
  assetId: string;
  assetVersion?: string;
}): {
  candidateBuildAvailable: boolean;
  runtimeAvailable: boolean;
  buildHash?: string;
} {
  const userRoot = options.userCatalogRoot ?? resolveWritableAssetCatalogRoot().path;
  const records = options.registry.getRecords().filter((item) => item.manifest.id === options.assetId);
  const record = options.assetVersion
    ? records.find((item) => item.manifest.version === options.assetVersion)
    : records[0];
  if (!record) {
    return { candidateBuildAvailable: false, runtimeAvailable: Boolean(getMotionComponent(options.assetId, options.assetVersion)) };
  }

  const runtimeAvailable = Boolean(getMotionComponent(record.manifest.id, record.manifest.version));
  let candidateBuildAvailable = false;
  let buildHash: string | undefined;
  try {
    // Touch path resolver so unsafe ids still fail closed if ever passed here.
    resolveMotionAssetPaths(userRoot, record.manifest.id, record.manifest.version);
    const entry = record.manifest.implementation.entry;
    const match = /^runtime\/([a-f0-9]+)\/component\.js$/.exec(entry);
    if (match) {
      buildHash = match[1];
      candidateBuildAvailable = true;
    }
  } catch {
    // ignore
  }

  if (record.manifest.status === 'draft') {
    return { candidateBuildAvailable, runtimeAvailable: false, buildHash };
  }
  return { candidateBuildAvailable, runtimeAvailable, buildHash };
}
