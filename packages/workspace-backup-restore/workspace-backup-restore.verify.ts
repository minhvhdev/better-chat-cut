import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBackupRestoreService, BackupError } from './src/index.ts';

const root = await mkdtemp(join(tmpdir(), 'bcc-backup-'));
const data = join(root, 'data');
const backups = join(root, 'backups');
try {
  const svc = createBackupRestoreService({ backupRoot: backups, dataRoot: data, appVersion: '0.1.7' });
  await svc.seedFixtureArea('projects', 'demo.json', JSON.stringify({ id: 'proj1' }));
  await svc.seedFixtureArea('production-runs', 'run1.json', JSON.stringify({ runId: 'r1' }));
  await svc.seedFixtureArea('media', 'clip.bin', 'media-bytes');

  const workflowsPlan = await svc.planBackup({
    schemaVersion: '1.0.0',
    id: 'b1',
    name: 'workflows',
    profile: 'workflows-only',
  });
  assert.equal(workflowsPlan.includeCredentials, false);
  assert.ok(workflowsPlan.areas.find((a) => a.id === 'media' && a.included === false));
  assert.ok(workflowsPlan.areas.find((a) => a.id === 'projects' && a.included === true));

  const op = await svc.createBackup(workflowsPlan);
  assert.equal(op.status, 'completed');
  assert.ok(op.backupId);
  const v = await svc.validateBackup(op.backupId!);
  assert.equal(v.valid, true);
  assert.equal(v.manifest?.connectionReauthenticationRequired, true);
  assert.ok(!v.manifest?.files.some((f) => f.relativePath.includes('media')));

  const completePlan = await svc.planBackup({
    schemaVersion: '1.0.0',
    id: 'b2',
    name: 'complete',
    profile: 'complete-local-workspace',
  });
  const op2 = await svc.createBackup(completePlan);
  assert.equal(op2.status, 'completed');
  const v2 = await svc.validateBackup(op2.backupId!);
  assert.equal(v2.valid, true);
  assert.ok(v2.manifest?.files.some((f) => f.relativePath.startsWith('media/')));

  // Destructive confirm required
  const rplan = await svc.planRestore(op2.backupId!, { dryRun: false });
  await assert.rejects(
    () => svc.applyRestore(rplan, { confirmDestructive: false }),
    (e: unknown) => e instanceof BackupError && e.code === 'RESTORE_FORBIDDEN',
  );

  // Dry-run restore
  const dryPlan = await svc.planRestore(op2.backupId!, { dryRun: true });
  const dryOp = await svc.applyRestore(dryPlan, { confirmDestructive: true });
  assert.equal(dryOp.status, 'completed');

  // Fresh data root restore
  const data2 = join(root, 'data2');
  const svc2 = createBackupRestoreService({ backupRoot: backups, dataRoot: data2, appVersion: '0.1.7' });
  const rplan2 = await svc2.planRestore(op2.backupId!, { dryRun: false });
  const rop = await svc2.applyRestore(rplan2, { confirmDestructive: true });
  assert.equal(rop.status, 'completed');
  const report = await svc2.getRestoreReport(rop.restoreId!);
  assert.equal(report?.connectionReauthenticationRequired, true);
  assert.ok((report?.appliedFiles ?? 0) >= 1);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('workspace-backup-restore: ok');
