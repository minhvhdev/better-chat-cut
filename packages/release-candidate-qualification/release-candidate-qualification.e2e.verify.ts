import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createQualificationService } from './src/index.ts';
import {
  buildDistributionPlan,
  createDistributionBuildService,
} from '../desktop-distribution/src/index.ts';

const root = await mkdtemp(join(tmpdir(), 'bcc-rc-e2e-'));
const repoRoot = process.cwd();
const distRoot = join(root, 'dist');
try {
  const { plan: distPlan } = await buildDistributionPlan(repoRoot, {
    id: 'e2e-rc-dist',
    name: 'e2e',
    targets: [{
      platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
      arch: process.arch === 'arm64' ? 'arm64' : 'x64',
      formats: ['nsis'],
      required: true,
    }],
    qualificationProfile: 'development',
    requireCleanTree: false,
  }, { allowDirty: true });
  const dist = createDistributionBuildService({ repoRoot, distributionRoot: distRoot, dryRun: true });
  const op = await dist.submitBuild('e2e', distPlan);
  const man = await dist.getManifest(op.operationId);
  assert.ok(man);
  assert.equal(op.artifacts.every((a) => a.stub === true), true);

  const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as { version: string };
  const svc = createQualificationService({ repoRoot, rcRoot: root, distributionRoot: distRoot });
  const plan = await svc.preparePlan({
    id: 'e2e-internal',
    name: 'E2E internal',
    version: pkg.version,
    distributionManifestHash: man!.manifestHash,
    channel: 'internal',
    profile: 'internal-development',
  });
  const { report, closure } = await svc.validate(plan, {
    profile: 'internal-development',
    executeCommands: false,
    distributionEvidence: {
      distributionId: man!.distributionId,
      distributionManifestHash: man!.manifestHash,
      operationId: op.operationId,
    },
  });

  // Explicit expected results: stubs do not close roadmap; no forced pass
  assert.equal(closure.roadmapClosed, false);
  assert.ok(report.status === 'qualified' || report.status === 'qualified-with-warnings' || report.status === 'failed');
  assert.equal(report.checks.some((c) => c.required && c.status === 'skipped'), false);
  // Roadmap-closure profile must reject stubs even without full command suite when artifacts checked
  const closePlan = await svc.preparePlan({
    id: 'e2e-close-attempt',
    name: 'Close attempt with stubs',
    version: pkg.version,
    distributionManifestHash: man!.manifestHash,
    channel: 'candidate',
    profile: 'roadmap-closure',
  });
  const close = await svc.validate(closePlan, {
    profile: 'roadmap-closure',
    executeCommands: false,
    distributionEvidence: {
      distributionId: man!.distributionId,
      distributionManifestHash: man!.manifestHash,
      operationId: op.operationId,
    },
  });
  assert.equal(close.closure.roadmapClosed, false);
  assert.equal(close.report.status, 'failed');
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('release-candidate-qualification.e2e: ok');
