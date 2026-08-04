import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  FINALIZATION_CONTROL_TOOLS,
  FINALIZATION_TOOL_NAMES,
  runFinalizationControlTool,
  setFinalizationServicesForTests,
} from './finalization-tools.ts';
import { createDistributionBuildService } from '../../../packages/desktop-distribution/src/index.ts';
import { createConnectionOnboardingService, createFakeCredentialVault } from '../../../packages/secure-connection-onboarding/src/index.ts';
import { createBackupRestoreService } from '../../../packages/workspace-backup-restore/src/index.ts';
import { createQualificationService } from '../../../packages/release-candidate-qualification/src/index.ts';
import { buildDistributionPlan } from '../../../packages/desktop-distribution/src/index.ts';

const required = [
  'distribution_get_contract',
  'distribution_plan_build',
  'distribution_submit_build',
  'distribution_build_status',
  'connection_onboarding_get_contract',
  'connection_onboarding_begin',
  'connection_onboarding_status',
  'connection_onboarding_disconnect',
  'backup_get_contract',
  'backup_plan',
  'backup_create',
  'backup_status',
  'backup_validate',
  'restore_plan',
  'restore_apply',
  'restore_status',
  'release_candidate_get_contract',
  'release_candidate_prepare',
  'release_candidate_validate',
];
assert.equal(FINALIZATION_CONTROL_TOOLS.length, 19);
for (const name of required) {
  assert.ok(FINALIZATION_TOOL_NAMES.includes(name), `missing ${name}`);
}

const tmp = await mkdtemp(join(tmpdir(), 'bcc-fin-mcp-'));
try {
  const distRoot = join(tmp, 'dist');
  const vaultRoot = join(tmp, 'vault');
  const backupRoot = join(tmp, 'backup');
  const dataRoot = join(tmp, 'data');
  const rcRoot = join(tmp, 'rc');

  setFinalizationServicesForTests({
    distribution: createDistributionBuildService({ distributionRoot: distRoot, dryRun: true }),
    onboarding: createConnectionOnboardingService({
      vault: createFakeCredentialVault(vaultRoot),
      fakeProvider: true,
    }),
    backup: createBackupRestoreService({ backupRoot, dataRoot, appVersion: '0.1.7' }),
    qualification: createQualificationService({ rcRoot, repoRoot: process.cwd() }),
  });

  const contract = await runFinalizationControlTool('distribution_get_contract', {});
  assert.ok(contract);

  const caps = (await import('../../../packages/desktop-distribution/src/index.ts')).resolveDistributionCapabilities();
  const platform = caps.host.platform === 'windows' || caps.host.platform === 'win32' ? 'windows'
    : caps.host.platform === 'macos' || caps.host.platform === 'darwin' ? 'macos' : 'linux';
  // host.platform is already normalized in capabilities
  const p = ['macos', 'windows', 'linux'].includes(caps.host.platform) ? caps.host.platform : platform;
  const arch = caps.host.arch === 'arm64' ? 'arm64' : 'x64';
  const format = p === 'windows' ? 'nsis' : p === 'macos' ? 'dmg' : 'AppImage';

  const planned = await runFinalizationControlTool('distribution_plan_build', {
    request: {
      id: 'mcp-plan',
      name: 'MCP plan',
      targets: [{ platform: p, arch, formats: [format], required: true }],
      qualificationProfile: 'development',
    },
  }) as { plan: { planHash: string; id: string } };
  assert.ok(planned.plan?.planHash);

  // Use full plan from builder
  const full = await buildDistributionPlan(process.cwd(), {
    id: 'mcp-plan',
    name: 'MCP plan',
    targets: [{ platform: p as 'windows', arch: arch as 'x64', formats: [format], required: true }],
    qualificationProfile: 'development',
    requireCleanTree: false,
  }, { allowDirty: true });

  const op = await runFinalizationControlTool('distribution_submit_build', {
    requestId: 'mcp-req',
    plan: full.plan,
  }) as { operationId: string; status: string };
  assert.equal(op.status, 'completed');

  const status = await runFinalizationControlTool('distribution_build_status', {
    operationId: op.operationId,
  }) as { operation: { status: string }; manifest: { manifestHash: string } | null };
  assert.equal(status.operation.status, 'completed');
  assert.ok(status.manifest?.manifestHash);

  // Install a dedicated onboarding service used by subsequent MCP calls.
  const onboard = createConnectionOnboardingService({
    vault: createFakeCredentialVault(join(tmp, 'vault2')),
    fakeProvider: true,
  });
  setFinalizationServicesForTests({ onboarding: onboard });

  const session = await runFinalizationControlTool('connection_onboarding_begin', {
    requestId: 'o1',
    openBrowser: false,
    request: {
      schemaVersion: '1.0.0',
      platform: 'youtube',
      connectionId: 'conn.mcp',
      requestedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
    },
  }) as { sessionId: string };
  const st = await runFinalizationControlTool('connection_onboarding_status', {
    sessionId: session.sessionId,
  });
  assert.ok(st);
  // completeFake closes loopback — critical: open oauth listeners hang Windows process exit
  await onboard.completeFake(session.sessionId);
  const disc = await runFinalizationControlTool('connection_onboarding_disconnect', {
    requestId: 'd1',
    connectionId: 'conn.mcp',
    dryRun: false,
  }) as { disconnected: boolean };
  assert.equal(disc.disconnected, true);

  const bsvc = createBackupRestoreService({ backupRoot, dataRoot: join(tmp, 'data2'), appVersion: '0.1.7' });
  setFinalizationServicesForTests({ backup: bsvc });
  await bsvc.seedFixtureArea('projects', 'p.json', '{}');
  const bplan = await runFinalizationControlTool('backup_plan', {
    request: { id: 'bk1', name: 'b', profile: 'workflows-only' },
  }) as { planHash: string };
  const bop = await runFinalizationControlTool('backup_create', { plan: bplan }) as { status: string; backupId: string };
  assert.equal(bop.status, 'completed');
  const bv = await runFinalizationControlTool('backup_validate', { backupId: bop.backupId }) as { valid: boolean };
  assert.equal(bv.valid, true);
  const rplan = await runFinalizationControlTool('restore_plan', { backupId: bop.backupId, dryRun: true });
  const rop = await runFinalizationControlTool('restore_apply', { plan: rplan, confirmDestructive: true }) as { status: string };
  assert.equal(rop.status, 'completed');

  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
  const rcPlan = await runFinalizationControlTool('release_candidate_prepare', {
    id: 'rc-mcp',
    name: 'RC MCP',
    version: pkg.version,
    distributionManifestHash: status.manifest!.manifestHash,
    channel: 'internal',
  });
  const rc = await runFinalizationControlTool('release_candidate_validate', {
    plan: rcPlan,
    profile: 'internal-development',
    executeCommands: false,
    distributionEvidence: {
      distributionId: status.manifest && 'distributionId' in status.manifest
        ? (status.manifest as { distributionId?: string }).distributionId
        : '',
      distributionManifestHash: status.manifest!.manifestHash,
      operationId: op.operationId,
    },
  }) as { report: { status: string }; closure: { roadmapClosed: boolean } };
  assert.ok(rc.report);
  assert.equal(rc.closure.roadmapClosed, false);

  setFinalizationServicesForTests({
    distribution: null,
    onboarding: null,
    backup: null,
    qualification: null,
  });
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log('finalization-tools: ok');
process.exit(0);
