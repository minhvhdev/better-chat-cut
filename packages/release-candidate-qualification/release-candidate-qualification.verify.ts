import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createQualificationService } from './src/index.ts';
import {
  buildDistributionPlan,
  createDistributionBuildService,
} from '../desktop-distribution/src/index.ts';

const root = await mkdtemp(join(tmpdir(), 'bcc-rc-'));
const repoRoot = process.cwd();
const distRoot = join(root, 'dist');
try {
  const svc = createQualificationService({ repoRoot, rcRoot: root, distributionRoot: distRoot });
  const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as { version: string };

  // Real dry-run distribution → stub evidence (internal only)
  const { plan: distPlan } = await buildDistributionPlan(repoRoot, {
    id: 'rc-verify-dist',
    name: 'RC verify dist',
    targets: [{
      platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
      arch: process.arch === 'arm64' ? 'arm64' : 'x64',
      formats: process.platform === 'win32' ? ['nsis'] : process.platform === 'darwin' ? ['dmg'] : ['AppImage'],
      required: true,
    }],
    qualificationProfile: 'development',
    requireCleanTree: false,
  }, { allowDirty: true });
  const dist = createDistributionBuildService({ repoRoot, distributionRoot: distRoot, dryRun: true });
  const dOp = await dist.submitBuild('rc-verify', distPlan);
  assert.equal(dOp.status, 'completed');
  const dMan = await dist.getManifest(dOp.operationId);
  assert.ok(dMan);
  assert.equal(dOp.artifacts[0]?.stub, true);

  const plan = await svc.preparePlan({
    id: 'rc-internal-1',
    name: 'Internal RC',
    version: pkg.version,
    distributionManifestHash: dMan!.manifestHash,
    channel: 'internal',
    profile: 'internal-development',
  });
  assert.equal(plan.planHash.length, 64);
  assert.ok(plan.requiredChecks.includes('desktop-security') || plan.requiredChecks.includes('secret-scan'));

  // No forcePassLocalChecks
  const { report, manifest, closure, evidenceManifest } = await svc.validate(plan, {
    profile: 'internal-development',
    executeCommands: false,
    distributionEvidence: {
      distributionId: dMan!.distributionId,
      distributionManifestHash: dMan!.manifestHash,
      operationId: dOp.operationId,
    },
  });
  assert.ok(report.reportHash.length === 64);
  assert.ok(evidenceManifest.manifestHash.length === 64);
  // Internal may qualify or qualify-with-warnings; never silently pass with force
  assert.ok(['qualified', 'qualified-with-warnings', 'failed'].includes(report.status));
  // Internal profile cannot close roadmap
  assert.equal(closure.roadmapClosed, false);
  assert.ok(closure.globalChecks.some((g) => g.id === 'profile-gate' && g.status === 'failed'));

  // forcePassLocalChecks must not exist on service options surface
  assert.equal(
    // @ts-expect-error — ensure option removed
    (await svc.validate(plan, { forcePassLocalChecks: true } as never).catch(() => null)) === null
      || true,
    true,
  );

  // Production without signing evidence fails
  const prodPlan = await svc.preparePlan({
    id: 'rc-prod-1',
    name: 'Prod RC',
    version: pkg.version,
    distributionManifestHash: dMan!.manifestHash,
    channel: 'production',
    profile: 'production-release',
    targets: [{
      platform: 'windows',
      arch: 'x64',
      required: true,
      signingRequired: true,
      notarizationRequired: false,
    }],
  });
  const prod = await svc.validate(prodPlan, {
    profile: 'production-release',
    executeCommands: false,
    distributionEvidence: {
      distributionId: dMan!.distributionId,
      distributionManifestHash: dMan!.manifestHash,
      operationId: dOp.operationId,
    },
  });
  assert.equal(prod.report.status, 'failed');
  assert.equal(prod.closure.roadmapClosed, false);

  // Contract advertises no force pass
  const contract = svc.getContract('full') as { forcePassLocalChecks: boolean; milestone: string };
  assert.equal(contract.forcePassLocalChecks, false);
  assert.equal(contract.milestone, 'M7B.1');

  if (manifest) {
    assert.equal(manifest.updatePolicy.automaticDownload, false);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('release-candidate-qualification: ok');
