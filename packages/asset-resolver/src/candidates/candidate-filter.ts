import type { AssetManifestV1 } from '../../../global-asset-registry/src/asset-types.ts';
import type { AssetResolutionPolicyV1 } from '../contracts/resolution-policy.ts';
import type { AssetResolutionReason } from '../contracts/resolution-candidate.ts';
import { validateMotionProps } from '../../../motion-components/src/index.ts';
import { stableStringify } from '../schema/requirement-serialization.ts';

export type SnapshotAssetRecord = {
  manifest: AssetManifestV1;
  contentHash: string;
  implementationFingerprint?: string;
  runtimeAvailable: boolean;
  defaultProps: Record<string, unknown>;
  propsSchema?: Record<string, unknown>;
  storageScope: 'bundled' | 'user';
  isDraftCandidate: boolean;
  hasManifestDiagnosticError: boolean;
};

export type AssetResolutionSnapshot = {
  catalogRevision: string;
  motionRuntimeRevision: string;
  resolverRevision: string;
  assets: SnapshotAssetRecord[];
  createdFromConsistentSnapshot: boolean;
};

export type SearchableRequirement = {
  queries: string[];
  aliases?: string[];
  kinds?: { allowed?: string[]; preferred?: string[] };
  requiredCapabilities?: string[];
  preferredCapabilities?: string[];
  categories?: string[];
  tags?: string[];
  styleTags?: string[];
  implementationTypes?: string[];
  preferredAssetIds?: string[];
  blockedAssetIds?: string[];
  exactAsset?: { id: string; version: string };
  desiredProps?: Record<string, unknown>;
  fitHint?: 'contain' | 'cover' | 'stretch';
};

export function buildQuerySignature(req: SearchableRequirement): string {
  return stableStringify({
    queries: req.queries,
    aliases: req.aliases ?? [],
    kindsAllowed: req.kinds?.allowed ?? [],
    kindsPreferred: req.kinds?.preferred ?? [],
    requiredCapabilities: req.requiredCapabilities ?? [],
    preferredCapabilities: req.preferredCapabilities ?? [],
    categories: req.categories ?? [],
    tags: req.tags ?? [],
    styleTags: req.styleTags ?? [],
    implementationTypes: req.implementationTypes ?? [],
    preferredAssetIds: req.preferredAssetIds ?? [],
    blockedAssetIds: req.blockedAssetIds ?? [],
    exactAsset: req.exactAsset ?? null,
  });
}

export type RejectedCandidate = {
  assetId: string;
  assetVersion: string;
  reasonCodes: string[];
  reasons: AssetResolutionReason[];
};

export type ScoredCandidate = {
  record: SnapshotAssetRecord;
  score: number;
  semanticScore: number;
  matchedFields: string[];
  reasons: AssetResolutionReason[];
  normalizedProps: Record<string, unknown>;
  propsValid: boolean;
  propsDifferFromDefaults: boolean;
  exactPin: boolean;
  preferred: boolean;
  runtimeVerified: boolean;
  assetId: string;
  assetVersion: string;
  status: SnapshotAssetRecord['manifest']['status'];
};

export function hardFilterCandidate(
  record: SnapshotAssetRecord,
  req: SearchableRequirement,
  policy: AssetResolutionPolicyV1,
  options?: { exactPinMode?: boolean },
): RejectedCandidate | null {
  const manifest = record.manifest;
  const reasons: AssetResolutionReason[] = [];
  const reasonCodes: string[] = [];
  const push = (code: string, message: string) => {
    reasonCodes.push(code);
    reasons.push({ code, message });
  };

  const blocked = new Set(req.blockedAssetIds ?? []);
  if (blocked.has(manifest.id)) push('BLOCKED_ASSET_ID', 'Asset id is blocked');

  if (options?.exactPinMode && req.exactAsset) {
    if (manifest.id !== req.exactAsset.id || manifest.version !== req.exactAsset.version) {
      push('EXACT_VERSION_MISMATCH', 'Does not match exact pin');
    }
  }

  if (manifest.status === 'draft') push('DRAFT_NOT_ALLOWED', 'Draft assets cannot be selected');
  if (!policy.allowedStatuses.includes(manifest.status)) {
    if (!(manifest.status === 'deprecated' && options?.exactPinMode && policy.allowDeprecatedExactPin)) {
      push('STATUS_NOT_ALLOWED', `Status ${manifest.status} not allowed by policy`);
    }
  }
  if (manifest.status === 'deprecated') {
    if (!(options?.exactPinMode && policy.allowDeprecatedExactPin && req.exactAsset?.id === manifest.id && req.exactAsset.version === manifest.version)) {
      push('DEPRECATED_NOT_ALLOWED', 'Deprecated assets are not auto-selected');
    }
  }

  if (req.kinds?.allowed?.length && !req.kinds.allowed.includes(manifest.kind)) {
    push('KIND_NOT_ALLOWED', `Kind ${manifest.kind} not allowed`);
  }
  if (req.implementationTypes?.length && !req.implementationTypes.includes(manifest.implementation.type)) {
    push('IMPLEMENTATION_NOT_ALLOWED', `Implementation ${manifest.implementation.type} not allowed`);
  }
  for (const cap of req.requiredCapabilities ?? []) {
    if (!manifest.capabilities.includes(cap)) {
      push('MISSING_REQUIRED_CAPABILITY', `Missing required capability ${cap}`);
    }
  }
  if (policy.requireRuntime && !record.runtimeAvailable) {
    push('RUNTIME_NOT_AVAILABLE', 'Runtime not available');
  }
  if (record.isDraftCandidate) {
    push('DRAFT_NOT_ALLOWED', 'Draft candidate runtime cannot be selected');
  }
  if (record.hasManifestDiagnosticError) {
    push('MANIFEST_DIAGNOSTIC_ERROR', 'Manifest has diagnostic errors');
  }
  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    push('EXACT_VERSION_MISMATCH', 'Asset version is not parseable');
  }

  if (req.desiredProps) {
    const validated = validateMotionProps(record.propsSchema, req.desiredProps, record.defaultProps);
    if (!validated.valid) {
      push('INVALID_DESIRED_PROPS', 'Desired props failed validation');
    }
  }

  if (reasonCodes.length) {
    return { assetId: manifest.id, assetVersion: manifest.version, reasonCodes, reasons };
  }
  return null;
}

export function validateDesiredProps(
  record: SnapshotAssetRecord,
  desiredProps: Record<string, unknown> | undefined,
): {
  valid: boolean;
  normalizedProps: Record<string, unknown>;
  differsFromDefaults: boolean;
} {
  const validated = validateMotionProps(record.propsSchema, desiredProps ?? {}, record.defaultProps);
  const normalizedProps = validated.normalizedProps;
  const differsFromDefaults = stableStringify(normalizedProps) !== stableStringify(record.defaultProps);
  return {
    valid: validated.valid,
    normalizedProps,
    differsFromDefaults,
  };
}
