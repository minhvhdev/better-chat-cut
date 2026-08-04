/**
 * M7B end-to-end finalization: OAuth vault + backup/restore + distribution + RC + closure.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createConnectionOnboardingService,
  createFakeCredentialVault,
} from '../secure-connection-onboarding/src/index.ts';
import { createBackupRestoreService } from '../workspace-backup-restore/src/index.ts';
import {
  buildDistributionPlan,
  createDistributionBuildService,
  resolveDistributionCapabilities,
} from '../desktop-distribution/src/index.ts';
import { createQualificationService } from './src/index.ts';

const root = await mkdtemp(join(tmpdir(), 'bcc-m7b-e2e-'));
const repoRoot = process.cwd();
try {
  // Representative workspace fixtures
  const dataRoot = join(root, 'data');
  const backupRoot = join(root, 'backups');
  const vaultRoot = join(root, 'vault');
  const distRoot = join(root, 'dist');
  const rcRoot = join(root, 'rc');

  const backup = createBackupRestoreService({ backupRoot, dataRoot, appVersion: '0.1.7' });
  await backup.seedFixtureArea('projects', 'proj.json', JSON.stringify({ id: 'p1' }));
  await backup.seedFixtureArea('production-runs', 'run.json', JSON.stringify({ runId: 'r1' }));
  await backup.seedFixtureArea('publishing-runs', 'pub.json', JSON.stringify({ runId: 'pub1' }));
  await backup.seedFixtureArea('media', 'clip.bin', 'bytes');

  // OAuth fake
  const vault = createFakeCredentialVault(vaultRoot);
  const oauth = createConnectionOnboardingService({ vault, fakeProvider: true });
  const session = await oauth.begin('e2e', {
    schemaVersion: '1.0.0',
    platform: 'youtube',
    connectionId: 'yt.e2e',
    requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
  });
  const done = await oauth.completeFake(session.sessionId);
  assert.equal(done.status, 'completed');
  const tokens = await oauth.resolveTokensForServer('yt.e2e');
  assert.ok(tokens?.accessToken);
  // No plaintext on disk
  for (const f of await readdir(join(vaultRoot, 'entries'))) {
    const raw = await readFile(join(vaultRoot, 'entries', f), 'utf8');
    assert.doesNotMatch(raw, /fake-access/);
  }

  // Backups
  const wPlan = await backup.planBackup({
    schemaVersion: '1.0.0', id: 'w', name: 'w', profile: 'workflows-only',
  });
  const wOp = await backup.createBackup(wPlan);
  assert.equal(wOp.status, 'completed');
  assert.equal((await backup.validateBackup(wOp.backupId!)).valid, true);

  const cPlan = await backup.planBackup({
    schemaVersion: '1.0.0', id: 'c', name: 'c', profile: 'complete-local-workspace',
  });
  const cOp = await backup.createBackup(cPlan);
  assert.equal(cOp.status, 'completed');

  // Restore to empty profile
  const data2 = join(root, 'data2');
  const backup2 = createBackupRestoreService({ backupRoot, dataRoot: data2, appVersion: '0.1.7' });
  const rPlan = await backup2.planRestore(cOp.backupId!, { dryRun: false });
  const rOp = await backup2.applyRestore(rPlan, { confirmDestructive: true });
  assert.equal(rOp.status, 'completed');
  const report = await backup2.getRestoreReport(rOp.restoreId!);
  assert.equal(report?.connectionReauthenticationRequired, true);

  // Distribution
  const caps = resolveDistributionCapabilities();
  const platform = (['macos', 'windows', 'linux'].includes(caps.host.platform)
    ? caps.host.platform
    : 'windows') as 'windows' | 'macos' | 'linux';
  const { plan: distPlan } = await buildDistributionPlan(repoRoot, {
    id: 'e2e-dist',
    name: 'E2E dist',
    targets: [{
      platform,
      arch: caps.host.arch === 'arm64' ? 'arm64' : 'x64',
      formats: platform === 'windows' ? ['nsis'] : platform === 'macos' ? ['dmg'] : ['AppImage'],
      required: true,
    }],
    qualificationProfile: 'development',
    requireCleanTree: false,
  }, { allowDirty: true });
  const dist = createDistributionBuildService({ repoRoot, distributionRoot: distRoot, dryRun: true });
  const dOp = await dist.submitBuild('e2e', distPlan);
  assert.equal(dOp.status, 'completed');
  const manifest = await dist.getManifest(dOp.operationId);
  assert.ok(manifest);

  // Qualification + closure
  const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as { version: string };
  const qual = createQualificationService({ repoRoot, rcRoot });
  const rcPlan = await qual.preparePlan({
    id: 'e2e-rc',
    name: 'E2E RC',
    version: pkg.version,
    distributionManifestHash: manifest!.manifestHash,
    channel: 'internal',
  });
  const { report: qReport, closure } = await qual.validate(rcPlan, {
    forcePassLocalChecks: true,
    distributionArtifacts: dOp.artifacts.map((a) => ({
      platform: a.platform,
      arch: a.arch,
      format: a.format,
      fileName: a.fileName,
      byteLength: a.byteLength,
      sha256: a.sha256,
      signingStatus: a.signing.status,
    })),
  });
  assert.ok(qReport.status === 'qualified' || qReport.status === 'qualified-with-warnings');
  assert.equal(qReport.checks.some((c) => c.required && c.status === 'skipped'), false);
  assert.ok(closure.milestones.find((m) => m.id === 'M7B'));

  // Production channel blocks without signing
  const prod = await qual.preparePlan({
    id: 'e2e-prod',
    name: 'prod',
    version: pkg.version,
    distributionManifestHash: manifest!.manifestHash,
    channel: 'production',
    targets: [{
      platform: 'windows',
      arch: 'x64',
      required: true,
      signingRequired: true,
      notarizationRequired: false,
    }],
  });
  const prodResult = await qual.validate(prod, {
    forcePassLocalChecks: true,
    distributionArtifacts: [{
      platform: 'windows',
      arch: 'x64',
      format: 'nsis',
      fileName: 'x.exe',
      byteLength: 1,
      sha256: '1'.repeat(64),
      signingStatus: 'not-configured',
    }],
  });
  assert.equal(prodResult.report.status, 'failed');
  assert.equal(prodResult.closure.roadmapClosed, false);

  await oauth.disconnect('yt.e2e', { dryRun: false });
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('m7b-finalization.e2e: ok');
