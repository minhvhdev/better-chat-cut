import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBackupRestoreService } from './src/index.ts';

// Cross-platform logical path fixture
const root = await mkdtemp(join(tmpdir(), 'bcc-backup-e2e-'));
try {
  const data = join(root, 'data');
  const backups = join(root, 'backups');
  const svc = createBackupRestoreService({ backupRoot: backups, dataRoot: data, appVersion: '0.1.7' });
  await mkdir(join(data, 'projects'), { recursive: true });
  await writeFile(join(data, 'projects', 'win-style.json'), '{"ok":true}');
  const plan = await svc.planBackup({
    schemaVersion: '1.0.0',
    id: 'e2e',
    name: 'e2e',
    profile: 'complete-local-workspace',
  });
  const op = await svc.createBackup(plan);
  assert.equal(op.status, 'completed');
  const v = await svc.validateBackup(op.backupId!);
  assert.equal(v.valid, true);
  for (const f of v.manifest!.files) {
    assert.equal(f.relativePath.includes('\\'), false);
    assert.equal(f.logicalPath.startsWith('logical://'), true);
    assert.equal(f.relativePath.includes('..'), false);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('workspace-backup-restore.e2e: ok');
