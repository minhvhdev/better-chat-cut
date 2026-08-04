import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  computeDesktopDistributionPlanHash,
  defaultSigningPolicy,
  defaultUpdatePolicy,
  validateDesktopDistributionPlan,
  DistributionError,
  type DesktopDistributionPlanV1,
  type DesktopDistributionTargetV1,
  type DesktopSigningPolicyV1,
  type DesktopUpdatePolicyV1,
} from '../../../desktop-distribution-contracts/src/index.ts';
import {
  fingerprintBuildConfig,
  fingerprintPackageLock,
  readPackageVersion,
  resolveDistributionCapabilities,
} from './distribution-capabilities.ts';

const execFileAsync = promisify(execFile);

export type DistributionPlanRequest = {
  id: string;
  name: string;
  description?: string;
  targets: DesktopDistributionTargetV1[];
  signing?: DesktopSigningPolicyV1;
  updatePolicy?: DesktopUpdatePolicyV1;
  qualificationProfile: DesktopDistributionPlanV1['qualificationProfile'];
  requireCleanTree?: boolean;
  commit?: string;
};

export async function detectSourceCommit(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return 'unknown'.padEnd(40, '0');
  }
}

export async function isSourceTreeClean(repoRoot: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoRoot });
    return stdout.trim().length === 0;
  } catch {
    return false;
  }
}

export async function buildDistributionPlan(
  repoRoot: string,
  request: DistributionPlanRequest,
  options?: { allowDirty?: boolean },
): Promise<{
  plan: DesktopDistributionPlanV1;
  capabilities: ReturnType<typeof resolveDistributionCapabilities>;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const caps = resolveDistributionCapabilities();
  const commit = request.commit ?? await detectSourceCommit(repoRoot);
  const clean = await isSourceTreeClean(repoRoot);
  if (request.requireCleanTree !== false && !clean && !options?.allowDirty) {
    warnings.push('Working tree is dirty; development qualification may still proceed with allowDirty');
  }

  const packageLockSha256 = await fingerprintPackageLock(repoRoot);
  const buildConfigSha256 = await fingerprintBuildConfig(repoRoot);
  const appVersion = readPackageVersion(repoRoot);

  for (const t of request.targets) {
    const match = caps.targets.find((c) => c.platform === t.platform && c.arch === t.arch);
    if (!match) {
      errors.push(`Unsupported target ${t.platform}/${t.arch}`);
      continue;
    }
    if (!match.localBuildSupported) {
      warnings.push(`Target ${t.platform}/${t.arch} is not locally buildable on this host; CI only`);
    }
  }

  const withoutHash = {
    schemaVersion: '1.0.0' as const,
    id: request.id,
    name: request.name,
    description: request.description,
    source: {
      commit,
      requireCleanTree: request.requireCleanTree !== false,
      appVersion,
      packageLockSha256,
      buildConfigSha256,
    },
    targets: request.targets,
    signing: request.signing ?? defaultSigningPolicy('unsigned'),
    updatePolicy: request.updatePolicy ?? defaultUpdatePolicy('disabled'),
    qualificationProfile: request.qualificationProfile,
  };

  const planHash = computeDesktopDistributionPlanHash(withoutHash);
  const plan: DesktopDistributionPlanV1 = {
    ...withoutHash,
    planHash,
    preparedAt: new Date().toISOString(),
  };

  const validated = validateDesktopDistributionPlan(plan);
  if (!validated.valid || !validated.value) {
    throw new DistributionError(
      'DISTRIBUTION_PLAN_INVALID',
      validated.errors.map((e) => e.message).join('; ') || 'Invalid plan',
      { errors: validated.errors },
    );
  }

  return { plan: validated.value, capabilities: caps, errors, warnings };
}
