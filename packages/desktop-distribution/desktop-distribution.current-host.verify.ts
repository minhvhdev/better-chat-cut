/**
 * Build a real current-host desktop package (electron-builder) and register it
 * as distribution evidence with buildMode=real, dryRun=false, stub=false.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, copyFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { DesktopDistributionArtifactV1, DesktopDistributionManifestV1 } from '../desktop-distribution-contracts/src/index.ts';
import { computeDesktopDistributionManifestHash } from '../desktop-distribution-contracts/src/index.ts';
import { DISTRIBUTION_REVISION } from '../desktop-distribution-contracts/src/schema/distribution-revision.ts';
import {
  fingerprintBuildConfig,
  fingerprintPackageLock,
  readDependencyVersion,
  readPackageVersion,
  resolveDistributionCapabilities,
} from './src/planning/distribution-capabilities.ts';
import { detectSourceCommit, isSourceTreeClean } from './src/planning/distribution-plan-builder.ts';

const repoRoot = process.cwd();
const caps = resolveDistributionCapabilities();
const platform = caps.host.platform;
const arch = caps.host.arch === 'arm64' ? 'arm64' : 'x64';

assert.ok(['windows', 'macos', 'linux'].includes(platform), `Unsupported host platform: ${platform}`);

const script =
  platform === 'windows'
    ? 'desktop:dist:win'
    : platform === 'macos'
      ? (arch === 'arm64' ? 'desktop:dist' : 'desktop:dist:mac-x64')
      : 'desktop:dist:linux';

console.log(`current-host package: running npm run ${script} (${platform}/${arch})`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = spawnSync(npm, ['run', script], {
  cwd: repoRoot,
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  stdio: 'inherit',
  shell: true,
});
assert.equal(run.status, 0, `desktop package script failed: ${script}`);

const releaseDir = join(repoRoot, 'release');
assert.ok(existsSync(releaseDir), 'release/ output directory missing');

const candidates: string[] = [];
async function walk(dir: string, depth: number): Promise<void> {
  if (depth > 3) return;
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, name.name);
    if (name.isDirectory()) {
      await walk(abs, depth + 1);
    } else if (/\.(exe|dmg|AppImage|msi|zip)$/i.test(name.name)) {
      candidates.push(abs);
    }
  }
}
await walk(releaseDir, 0);
const preferred = candidates.find((p) => /\.exe$/i.test(p) || /\.dmg$/i.test(p) || /\.AppImage$/i.test(p))
  ?? candidates[0];
assert.ok(preferred, `No package artifact found under release/: ${candidates.join(', ')}`);

const fileBuf = await readFile(preferred);
assert.ok(fileBuf.byteLength > 1024, 'Package artifact suspiciously small');
const stubHead = fileBuf.toString('utf8', 0, Math.min(40, fileBuf.byteLength));
assert.equal(stubHead.includes('DISTRIBUTION_STUB'), false, 'Artifact is a distribution stub');

const sha256 = createHash('sha256').update(fileBuf).digest('hex');
const fileName = preferred.split(/[/\\]/).pop()!;
const format = platform === 'windows' ? 'nsis' : platform === 'macos' ? 'dmg' : 'AppImage';
const version = readPackageVersion(repoRoot);
const commit = await detectSourceCommit(repoRoot);
const distRoot = process.env.BETTER_CHAT_CUT_DISTRIBUTION_ROOT
  ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'distributions');
const operationId = `dist-op.current-host.${Date.now().toString(36)}`;
const artDir = join(distRoot, 'operations', operationId, 'artifacts');
await mkdir(artDir, { recursive: true });
await copyFile(preferred, join(artDir, fileName));

const artifact: DesktopDistributionArtifactV1 = {
  artifactId: `artifact.current-host.${sha256.slice(0, 12)}`,
  platform: platform as 'windows' | 'macos' | 'linux',
  arch: arch as 'x64' | 'arm64',
  format,
  fileName,
  relativePath: `${operationId}/artifacts/${fileName}`,
  mimeType: 'application/octet-stream',
  byteLength: fileBuf.byteLength,
  sha256,
  signing: {
    status: 'not-requested',
    errors: [],
    warnings: [],
  },
  downloadUrl: `/api/better-chat-cut/distribution/operations/${operationId}/artifacts/${encodeURIComponent(fileName)}`,
  buildMode: 'real',
  dryRun: false,
  stub: false,
};

const provenance = {
  sourceCommit: commit,
  sourceTreeClean: await isSourceTreeClean(repoRoot),
  appVersion: version,
  nodeVersion: process.version,
  electronVersion: readDependencyVersion(repoRoot, 'electron'),
  electronBuilderVersion: readDependencyVersion(repoRoot, 'electron-builder'),
  packageLockSha256: await fingerprintPackageLock(repoRoot),
  buildConfigSha256: await fingerprintBuildConfig(repoRoot),
  productionRevision: 'm6a.1.0.0',
  publishingRevision: 'm6b.1.0.0',
  workspaceRevision: 'm7a.1.0.0',
  distributionRevision: DISTRIBUTION_REVISION,
  generatedAt: new Date().toISOString(),
};

const distributionId = `distribution.${operationId}`;
const planId = 'current-host-real';
const planHash = sha256;
const manifestBase = {
  schemaVersion: '1.0.0' as const,
  distributionId,
  planId,
  planHash,
  provenance,
  artifacts: [artifact],
  updatePolicy: {
    mode: 'manual-download' as const,
    releaseFeedConfigured: false as const,
    automaticDownload: false as const,
    automaticInstall: false as const,
  },
};
const manifest: DesktopDistributionManifestV1 = {
  ...manifestBase,
  manifestHash: computeDesktopDistributionManifestHash(manifestBase),
  createdAt: new Date().toISOString(),
};

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, path);
}

const opDir = join(distRoot, 'operations', operationId);
await atomicWriteJson(join(opDir, 'manifest.json'), manifest);
await atomicWriteJson(join(opDir, 'operation.json'), {
  schemaVersion: '1.0.0',
  operationId,
  planHash,
  planId,
  status: 'completed',
  targetProgress: [{ platform, arch, phase: 'electron-builder', status: 'completed' }],
  artifacts: [artifact],
  manifestHash: manifest.manifestHash,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

await atomicWriteJson(join(repoRoot, 'release', 'better-chat-cut-current-host-evidence.json'), {
  operationId,
  distributionId,
  distributionManifestHash: manifest.manifestHash,
  fileName,
  sha256,
  byteLength: fileBuf.byteLength,
  platform,
  arch,
  format,
  buildMode: 'real',
  dryRun: false,
  stub: false,
  sourceCommit: commit,
  appVersion: version,
});

console.log('desktop-distribution.current-host: ok');
console.log(JSON.stringify({
  operationId,
  distributionId,
  distributionManifestHash: manifest.manifestHash,
  fileName,
  sha256,
  byteLength: fileBuf.byteLength,
}, null, 2));
