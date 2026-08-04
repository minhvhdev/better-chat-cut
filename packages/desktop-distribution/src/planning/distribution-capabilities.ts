import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import {
  allowedFormatsForPlatform,
  type DesktopDistributionTargetV1,
} from '../../../desktop-distribution-contracts/src/index.ts';

export type DesktopDistributionCapabilitiesV1 = {
  host: {
    platform: string;
    arch: string;
  };
  targets: {
    platform: string;
    arch: string;
    formats: string[];
    localBuildSupported: boolean;
    ciBuildSupported: boolean;
    signingSupported: boolean;
    notarizationSupported: boolean;
  }[];
  updatePolicies: Array<'disabled' | 'manual-download'>;
};

function hostPlatform(): 'macos' | 'windows' | 'linux' | string {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux') return 'linux';
  return process.platform;
}

function hostArch(): 'x64' | 'arm64' | string {
  if (process.arch === 'x64' || process.arch === 'arm64') return process.arch;
  return process.arch;
}

const REPO_TARGETS: Array<{ platform: string; arch: string; formats: string[] }> = [
  { platform: 'macos', arch: 'arm64', formats: ['dmg'] },
  { platform: 'macos', arch: 'x64', formats: ['dmg'] },
  { platform: 'windows', arch: 'x64', formats: ['nsis'] },
  { platform: 'linux', arch: 'x64', formats: ['AppImage'] },
];

export function resolveDistributionCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): DesktopDistributionCapabilitiesV1 {
  const hostP = hostPlatform();
  const hostA = hostArch();
  const macSigning = Boolean(env.CSC_LINK || env.CSC_NAME);
  const winSigning = Boolean(env.CSC_LINK || env.WIN_CSC_LINK);
  const notarize = Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD);

  return {
    host: { platform: String(hostP), arch: String(hostA) },
    targets: REPO_TARGETS.map((t) => {
      const localBuildSupported = t.platform === hostP && t.arch === hostA;
      return {
        platform: t.platform,
        arch: t.arch,
        formats: t.formats.filter((f) => allowedFormatsForPlatform(t.platform).includes(f)),
        localBuildSupported,
        ciBuildSupported: true,
        signingSupported:
          (t.platform === 'macos' && macSigning)
          || (t.platform === 'windows' && winSigning)
          || t.platform === 'linux',
        notarizationSupported: t.platform === 'macos' && notarize,
      };
    }),
    updatePolicies: ['disabled', 'manual-download'],
  };
}

export async function hashFileSha256(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

export async function hashTextFileIfExists(path: string): Promise<string | null> {
  try {
    await access(path, constants.R_OK);
    return hashFileSha256(path);
  } catch {
    return null;
  }
}

export async function fingerprintBuildConfig(repoRoot: string): Promise<string> {
  const path = join(repoRoot, 'electron-builder.config.mjs');
  return hashFileSha256(path);
}

export async function fingerprintPackageLock(repoRoot: string): Promise<string> {
  const path = join(repoRoot, 'package-lock.json');
  return hashFileSha256(path);
}

export function readPackageVersion(repoRoot: string): string {
  const require = createRequire(join(repoRoot, 'package.json'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require(join(repoRoot, 'package.json')) as { version?: string };
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}

export function readDependencyVersion(repoRoot: string, name: string): string {
  try {
    const require = createRequire(join(repoRoot, 'package.json'));
    const pkgPath = require.resolve(`${name}/package.json`);
    const pkg = require(pkgPath) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function filterLocallyBuildableTargets(
  targets: DesktopDistributionTargetV1[],
  caps: DesktopDistributionCapabilitiesV1,
): DesktopDistributionTargetV1[] {
  return targets.filter((t) =>
    caps.targets.some(
      (c) => c.platform === t.platform && c.arch === t.arch && c.localBuildSupported,
    ));
}
