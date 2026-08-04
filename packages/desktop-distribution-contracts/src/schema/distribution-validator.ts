import { asRecord } from './serialization.ts';
import { computeDesktopDistributionPlanHash } from './distribution-hash.ts';
import { defaultUpdatePolicy } from '../contracts/update-policy.ts';
import { defaultSigningPolicy } from '../contracts/signing-policy.ts';
import type { DesktopDistributionPlanV1 } from '../contracts/distribution-plan.ts';
import type { DesktopDistributionTargetV1 } from '../contracts/distribution-target.ts';
import type { DesktopSigningPolicyV1 } from '../contracts/signing-policy.ts';
import type { DesktopUpdatePolicyV1 } from '../contracts/update-policy.ts';
import type { DistributionDiagnostic } from '../contracts/distribution-diagnostic.ts';
import { distributionDiagnostic } from '../contracts/distribution-diagnostic.ts';

const ALLOWED_FORMATS: Record<string, string[]> = {
  macos: ['dmg', 'zip'],
  windows: ['nsis', 'portable'],
  linux: ['AppImage', 'deb'],
};

export type ValidationResult<T> = {
  valid: boolean;
  value?: T;
  errors: DistributionDiagnostic[];
  warnings: DistributionDiagnostic[];
};

function err(code: string, message: string): DistributionDiagnostic {
  return distributionDiagnostic('error', code, message);
}

function isPlatform(v: unknown): v is DesktopDistributionTargetV1['platform'] {
  return v === 'macos' || v === 'windows' || v === 'linux';
}

function isArch(v: unknown): v is DesktopDistributionTargetV1['arch'] {
  return v === 'x64' || v === 'arm64';
}

export function normalizeDistributionTarget(
  raw: unknown,
): ValidationResult<DesktopDistributionTargetV1> {
  const errors: DistributionDiagnostic[] = [];
  const r = asRecord(raw);
  if (!r) return { valid: false, errors: [err('DISTRIBUTION_TARGET_INVALID', 'Target must be object')], warnings: [] };
  if (!isPlatform(r.platform)) errors.push(err('DISTRIBUTION_TARGET_PLATFORM', 'Invalid platform'));
  if (!isArch(r.arch)) errors.push(err('DISTRIBUTION_TARGET_ARCH', 'Invalid arch'));
  if (!Array.isArray(r.formats) || r.formats.length === 0) {
    errors.push(err('DISTRIBUTION_TARGET_FORMATS', 'formats required'));
  }
  const platform = r.platform as string;
  const allowed = ALLOWED_FORMATS[platform] ?? [];
  const formats = Array.isArray(r.formats)
    ? r.formats.filter((f): f is string => typeof f === 'string')
    : [];
  for (const f of formats) {
    if (!allowed.includes(f)) {
      errors.push(err('DISTRIBUTION_TARGET_FORMAT_UNSUPPORTED', `Format not supported for ${platform}: ${f}`));
    }
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  return {
    valid: true,
    value: {
      platform: r.platform as DesktopDistributionTargetV1['platform'],
      arch: r.arch as DesktopDistributionTargetV1['arch'],
      formats,
      required: r.required !== false,
    },
    errors: [],
    warnings: [],
  };
}

export function validateUpdatePolicy(raw: unknown): ValidationResult<DesktopUpdatePolicyV1> {
  const errors: DistributionDiagnostic[] = [];
  const r = asRecord(raw) ?? {};
  const mode = r.mode === 'manual-download' ? 'manual-download' : r.mode === 'disabled' ? 'disabled' : null;
  if (!mode) errors.push(err('DISTRIBUTION_UPDATE_POLICY', 'updatePolicy.mode must be disabled|manual-download'));
  if (r.releaseFeedConfigured === true) {
    errors.push(err('DISTRIBUTION_UPDATE_FEED', 'releaseFeedConfigured must be false in M7B'));
  }
  if (r.automaticDownload === true) {
    errors.push(err('DISTRIBUTION_UPDATE_AUTO_DOWNLOAD', 'automaticDownload must be false'));
  }
  if (r.automaticInstall === true) {
    errors.push(err('DISTRIBUTION_UPDATE_AUTO_INSTALL', 'automaticInstall must be false'));
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  return { valid: true, value: defaultUpdatePolicy(mode!), errors: [], warnings: [] };
}

export function validateSigningPolicy(raw: unknown): ValidationResult<DesktopSigningPolicyV1> {
  const r = asRecord(raw);
  if (!r) return { valid: true, value: defaultSigningPolicy('unsigned'), errors: [], warnings: [] };
  const mode = r.mode === 'sign-when-configured' || r.mode === 'require-signed' || r.mode === 'unsigned'
    ? r.mode
    : null;
  if (!mode) {
    return {
      valid: false,
      errors: [err('DISTRIBUTION_SIGNING_MODE', 'Invalid signing mode')],
      warnings: [],
    };
  }
  // Reject any accidental secret-like fields.
  const banned = ['certificate', 'password', 'pfx', 'appleId', 'apiKey', 'privateKey', 'cscLink', 'cscKeyPassword'];
  for (const key of Object.keys(r)) {
    if (banned.some((b) => key.toLowerCase().includes(b.toLowerCase()))) {
      return {
        valid: false,
        errors: [err('DISTRIBUTION_SIGNING_SECRET', `Signing policy must not include secret field: ${key}`)],
        warnings: [],
      };
    }
  }
  const macos = asRecord(r.macos);
  const windows = asRecord(r.windows);
  const linux = asRecord(r.linux);
  return {
    valid: true,
    value: {
      mode,
      macos: macos
        ? {
          signingProfileId: typeof macos.signingProfileId === 'string' ? macos.signingProfileId : undefined,
          requireNotarization: macos.requireNotarization === true,
        }
        : undefined,
      windows: windows
        ? {
          signingProfileId: typeof windows.signingProfileId === 'string' ? windows.signingProfileId : undefined,
          requireTimestamp: windows.requireTimestamp === true,
        }
        : undefined,
      linux: linux
        ? {
          packageSigningProfileId: typeof linux.packageSigningProfileId === 'string'
            ? linux.packageSigningProfileId
            : undefined,
        }
        : undefined,
    },
    errors: [],
    warnings: [],
  };
}

export function validateDesktopDistributionPlan(raw: unknown): ValidationResult<DesktopDistributionPlanV1> {
  const errors: DistributionDiagnostic[] = [];
  const warnings: DistributionDiagnostic[] = [];
  const r = asRecord(raw);
  if (!r) return { valid: false, errors: [err('DISTRIBUTION_PLAN_INVALID', 'Plan must be object')], warnings };

  if (r.schemaVersion !== '1.0.0') errors.push(err('DISTRIBUTION_SCHEMA', 'schemaVersion must be 1.0.0'));
  if (typeof r.id !== 'string' || !r.id) errors.push(err('DISTRIBUTION_PLAN_ID', 'id required'));
  if (typeof r.name !== 'string' || !r.name) errors.push(err('DISTRIBUTION_PLAN_NAME', 'name required'));

  const source = asRecord(r.source);
  if (!source) errors.push(err('DISTRIBUTION_SOURCE', 'source required'));
  const commit = typeof source?.commit === 'string' ? source.commit : '';
  if (!commit || commit.length < 7) errors.push(err('DISTRIBUTION_SOURCE_COMMIT', 'source.commit required'));
  const appVersion = typeof source?.appVersion === 'string' ? source.appVersion : '';
  if (!appVersion) errors.push(err('DISTRIBUTION_APP_VERSION', 'source.appVersion required'));
  const packageLockSha256 = typeof source?.packageLockSha256 === 'string' ? source.packageLockSha256 : '';
  const buildConfigSha256 = typeof source?.buildConfigSha256 === 'string' ? source.buildConfigSha256 : '';
  if (!/^[a-f0-9]{64}$/.test(packageLockSha256)) errors.push(err('DISTRIBUTION_LOCK_HASH', 'packageLockSha256 must be sha256'));
  if (!/^[a-f0-9]{64}$/.test(buildConfigSha256)) errors.push(err('DISTRIBUTION_CONFIG_HASH', 'buildConfigSha256 must be sha256'));

  const targetsRaw = Array.isArray(r.targets) ? r.targets : [];
  if (targetsRaw.length === 0) errors.push(err('DISTRIBUTION_TARGETS', 'at least one target required'));
  const targets: DesktopDistributionTargetV1[] = [];
  for (const t of targetsRaw) {
    const vt = normalizeDistributionTarget(t);
    errors.push(...vt.errors);
    if (vt.value) targets.push(vt.value);
  }

  const signingV = validateSigningPolicy(r.signing);
  errors.push(...signingV.errors);
  const updateV = validateUpdatePolicy(r.updatePolicy ?? defaultUpdatePolicy('disabled'));
  errors.push(...updateV.errors);

  const profile = r.qualificationProfile;
  if (profile !== 'development' && profile !== 'release-candidate' && profile !== 'production') {
    errors.push(err('DISTRIBUTION_PROFILE', 'invalid qualificationProfile'));
  }

  if (errors.length || !signingV.value || !updateV.value || !source) {
    return { valid: false, errors, warnings };
  }

  const withoutHash = {
    schemaVersion: '1.0.0' as const,
    id: String(r.id),
    name: String(r.name),
    description: typeof r.description === 'string' ? r.description : undefined,
    source: {
      commit,
      requireCleanTree: source.requireCleanTree !== false,
      appVersion,
      packageLockSha256,
      buildConfigSha256,
    },
    targets,
    signing: signingV.value,
    updatePolicy: updateV.value,
    qualificationProfile: profile as DesktopDistributionPlanV1['qualificationProfile'],
  };
  const planHash = computeDesktopDistributionPlanHash(withoutHash);
  if (typeof r.planHash === 'string' && r.planHash.length === 64 && r.planHash !== planHash) {
    errors.push(err('DISTRIBUTION_PLAN_HASH_MISMATCH', 'planHash does not match plan contents'));
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    value: {
      ...withoutHash,
      planHash: typeof r.planHash === 'string' && r.planHash.length === 64 ? r.planHash : planHash,
      preparedAt: typeof r.preparedAt === 'string' ? r.preparedAt : new Date(0).toISOString(),
    },
    errors: [],
    warnings,
  };
}

export function allowedFormatsForPlatform(platform: string): string[] {
  return [...(ALLOWED_FORMATS[platform] ?? [])];
}
