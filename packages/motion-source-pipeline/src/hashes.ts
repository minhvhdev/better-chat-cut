import { createHash } from 'node:crypto';
import { stableStringify } from '../../global-asset-registry/src/asset-hash.ts';
import type { AssetManifestV1 } from '../../global-asset-registry/src/asset-types.ts';
import {
  MOTION_COMPILER_VERSION,
  MOTION_RUNTIME_CONTRACT_VERSION,
  MOTION_SANDBOX_CONTRACT_VERSION,
  MOTION_SDK_VERSION,
} from './constants.ts';

export function computeSourceHash(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/**
 * Fingerprint of implementation-affecting manifest fields.
 * Excludes status/deprecation and implementation.entry (entry is rewritten at prepare-staging).
 */
export function computeMotionImplementationFingerprint(manifest: AssetManifestV1): string {
  const payload = {
    id: manifest.id,
    version: manifest.version,
    kind: manifest.kind,
    implementation: {
      type: manifest.implementation.type,
      exportName: manifest.implementation.exportName ?? null,
    },
    propsSchema: manifest.propsSchema ?? null,
    capabilities: [...manifest.capabilities].sort(),
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function computeBuildHash(input: {
  sourceHash: string;
  implementationFingerprint: string;
  sdkVersion?: string;
  compilerVersion?: string;
  sandboxContractVersion?: string;
  runtimeContractVersion?: string;
  buildOptions?: Record<string, unknown>;
}): string {
  const payload = {
    sourceHash: input.sourceHash,
    implementationFingerprint: input.implementationFingerprint,
    sdkVersion: input.sdkVersion ?? MOTION_SDK_VERSION,
    compilerVersion: input.compilerVersion ?? MOTION_COMPILER_VERSION,
    sandboxContractVersion: input.sandboxContractVersion ?? MOTION_SANDBOX_CONTRACT_VERSION,
    runtimeContractVersion: input.runtimeContractVersion ?? MOTION_RUNTIME_CONTRACT_VERSION,
    buildOptions: input.buildOptions ?? {},
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function computeInputHash(parts: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(parts)).digest('hex');
}

export function computePixelHash(pngBuffer: Buffer): string {
  // Hash raw bytes; Remotion PNG is deterministic enough for same-platform verify.
  // Decoded-pixel compare is available in candidate preview for tolerance cases.
  return createHash('sha256').update(pngBuffer).digest('hex');
}
