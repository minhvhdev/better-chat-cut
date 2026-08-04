import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    buildDistributionPlan,
    createDistributionBuildService,
    resolveDistributionCapabilities,
    probeRepoDesktopInfrastructure,
} from './src/index.ts';

const repoRoot = process.cwd();
const caps = resolveDistributionCapabilities();
assert.ok(caps.targets.length >= 3);
assert.ok(caps.updatePolicies.includes('disabled'));

const infra = await probeRepoDesktopInfrastructure(repoRoot);
assert.equal(infra.hasElectronBuilderConfig, true);
assert.equal(infra.hasDesktopMain, true);
assert.ok(infra.packageScripts.includes('desktop:build:main'));

const tmp = await mkdtemp(join(tmpdir(), 'bcc-dist-'));
try {
  const hostP = caps.host.platform;
  const platform = hostP === 'macos' || hostP === 'windows' || hostP === 'linux'
    ? hostP
    : (process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux');
  const arch = caps.host.arch === 'arm64' ? 'arm64' : 'x64';
  const formats = platform === 'windows' ? ['nsis'] : platform === 'macos' ? ['dmg'] : ['AppImage'];

  const { plan, warnings } = await buildDistributionPlan(repoRoot, {
    id: 'plan.test.1',
    name: 'Test plan',
    targets: [{
      platform: platform as 'windows' | 'macos' | 'linux',
      arch: arch as 'x64' | 'arm64',
      formats,
      required: true,
    }],
    qualificationProfile: 'development',
    requireCleanTree: false,
  }, { allowDirty: true });
  assert.equal(plan.planHash.length, 64);
  assert.ok(Array.isArray(warnings));

  const svc = createDistributionBuildService({
    repoRoot,
    distributionRoot: tmp,
    dryRun: true,
  });
  const op = await svc.submitBuild('req-1', plan);
  assert.equal(op.status, 'completed');
  assert.ok(op.artifacts.length >= 1);
  assert.equal(op.artifacts[0]!.sha256.length, 64);
  const manifest = await svc.getManifest(op.operationId);
  assert.ok(manifest);
  assert.equal(manifest!.manifestHash.length, 64);
  assert.equal(manifest!.updatePolicy.automaticDownload, false);
  assert.equal(manifest!.updatePolicy.automaticInstall, false);
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log('desktop-distribution: ok');
