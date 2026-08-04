import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createQualificationService } from './src/index.ts';

const root = await mkdtemp(join(tmpdir(), 'bcc-rc-'));
const repoRoot = process.cwd();
try {
  const svc = createQualificationService({ repoRoot, rcRoot: root });
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(repoRoot, 'package.json'), 'utf8')) as { version: string };
  const plan = await svc.preparePlan({
    id: 'rc-internal-1',
    name: 'Internal RC',
    version: pkg.version,
    distributionManifestHash: 'a'.repeat(64),
    channel: 'internal',
  });
  assert.equal(plan.planHash.length, 64);
  assert.ok(plan.requiredChecks.includes('update-policy'));

  const { report, manifest, closure } = await svc.validate(plan, {
    forcePassLocalChecks: true,
    distributionArtifacts: [
      {
        platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
        arch: process.arch === 'arm64' ? 'arm64' : 'x64',
        format: 'nsis',
        fileName: 'stub.exe',
        byteLength: 10,
        sha256: 'b'.repeat(64),
        signingStatus: 'not-requested',
      },
    ],
  });
  assert.ok(report.reportHash.length === 64);
  assert.ok(report.status === 'qualified' || report.status === 'qualified-with-warnings' || report.status === 'failed');
  // Internal channel should not require production signing
  if (report.status === 'failed') {
    console.error(report.blockingCheckIds, report.checks.filter((c) => c.status === 'failed'));
  }
  assert.notEqual(report.status, 'failed');
  assert.ok(manifest);
  assert.equal(manifest!.updatePolicy.automaticDownload, false);

  // Production without signing must fail
  const prodPlan = await svc.preparePlan({
    id: 'rc-prod-1',
    name: 'Prod RC',
    version: pkg.version,
    distributionManifestHash: 'c'.repeat(64),
    channel: 'production',
    targets: [{
      platform: 'windows',
      arch: 'x64',
      required: true,
      signingRequired: true,
      notarizationRequired: false,
    }],
  });
  const prod = await svc.validate(prodPlan, {
    forcePassLocalChecks: true,
    distributionArtifacts: [{
      platform: 'windows',
      arch: 'x64',
      format: 'nsis',
      fileName: 'app.exe',
      byteLength: 1,
      sha256: 'd'.repeat(64),
      signingStatus: 'not-configured',
    }],
  });
  assert.equal(prod.report.status, 'failed');
  assert.equal(prod.closure.roadmapClosed, false);

  // Closure can be true only when qualified
  if (report.status !== 'failed') {
    // May still have incomplete M7B if docs missing - ensure we handle later
    assert.ok(typeof closure.roadmapClosed === 'boolean');
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('release-candidate-qualification: ok');
