import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  type WorkspaceMigrationPlanV1,
  type WorkspaceMigrationApplyInputV1,
  type WorkspaceMigrationReceiptV1,
  workspaceDiagnostic,
  computeWorkspaceEntityHash,
} from '../../../production-workspace-contracts/src/index.ts';
import {
  MIGRATION_REGISTRY,
  listPendingMigrations,
  listDataVersions,
  writeAreaVersion,
  type MigrationScanContext,
} from './migration-registry.ts';

export type MigrationContext = MigrationScanContext & {
  backupRoot: string;
};

function lockPath(ctx: MigrationContext): string {
  return join(ctx.migrationRoot, 'migration.lock');
}

function acquireLock(ctx: MigrationContext): void {
  mkdirSync(ctx.migrationRoot, { recursive: true });
  const path = lockPath(ctx);
  if (existsSync(path)) {
    let age = 0;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { createdAt?: string };
      if (raw.createdAt) age = Date.now() - Date.parse(raw.createdAt);
    } catch {
      age = Number.POSITIVE_INFINITY;
    }
    if (age < 1000 * 60 * 30) {
      throw new Error('Migration lock held by another process');
    }
  }
  writeFileSync(path, `${JSON.stringify({
    owner: `pid-${process.pid}`,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
}

function releaseLock(ctx: MigrationContext): void {
  try {
    unlinkSync(lockPath(ctx));
  } catch {
    /* ignore */
  }
}

function createBackup(ctx: MigrationContext, area: string, files: string[]): string {
  const backupId = `backup.${Date.now()}.${randomUUID().slice(0, 8)}`;
  const dir = join(ctx.backupRoot, backupId);
  mkdirSync(dir, { recursive: true });
  const copied: string[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const base = file.split(/[/\\]/).pop()!;
    const dest = join(dir, base);
    copyFileSync(file, dest);
    copied.push(base);
  }
  const manifest = {
    schemaVersion: '1.0.0',
    backupId,
    area,
    files: copied,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return backupId;
}

export function planMigrations(ctx: MigrationContext): WorkspaceMigrationPlanV1 {
  const pending = listPendingMigrations(ctx);
  const migrations = pending.map((p) => {
    const def = MIGRATION_REGISTRY.find((m) => m.id === p.migrationId)!;
    const planned = def.plan(ctx);
    return {
      migrationId: p.migrationId,
      area: p.area,
      affectedRecords: planned.affectedRecords,
      destructive: def.destructive,
      requiresBackup: def.requiresBackup,
      warnings: planned.warnings,
    };
  });
  const planId = `migration-plan.${computeWorkspaceEntityHash({ migrations }).slice(0, 12)}`;
  const planBody = {
    schemaVersion: '1.0.0' as const,
    planId,
    migrations,
    backupRequired: migrations.some((m) => m.requiresBackup && m.affectedRecords > 0),
  };
  const planHash = computeWorkspaceEntityHash(planBody);
  return { ...planBody, planHash };
}

export function applyMigrations(
  ctx: MigrationContext,
  input: WorkspaceMigrationApplyInputV1,
): WorkspaceMigrationReceiptV1 {
  const plan = planMigrations(ctx);
  if (plan.planId !== input.planId || plan.planHash !== input.planHash) {
    return {
      schemaVersion: '1.0.0',
      planId: input.planId,
      planHash: input.planHash,
      status: 'failed',
      applied: [],
      errors: [workspaceDiagnostic('error', 'WORKSPACE_MIGRATION_DRIFT',
        'Plan hash mismatch or plan drifted since planning', {
          recovery: 'Re-run plan-migrations and review the new plan hash before apply',
        })],
      warnings: [],
      appliedAt: new Date().toISOString(),
    };
  }

  if (input.dryRun) {
    return {
      schemaVersion: '1.0.0',
      planId: plan.planId,
      planHash: plan.planHash,
      status: plan.migrations.length === 0 ? 'noop' : 'applied',
      applied: plan.migrations.map((m) => m.migrationId),
      errors: [],
      warnings: [workspaceDiagnostic('info', 'WORKSPACE_MIGRATION_DRY_RUN', 'Dry-run only; no changes written')],
      appliedAt: new Date().toISOString(),
    };
  }

  if (plan.migrations.some((m) => m.destructive) && !input.confirmDestructive) {
    return {
      schemaVersion: '1.0.0',
      planId: plan.planId,
      planHash: plan.planHash,
      status: 'failed',
      applied: [],
      errors: [workspaceDiagnostic('error', 'WORKSPACE_MIGRATION_FAILED',
        'Destructive migration requires confirmDestructive=true')],
      warnings: [],
      appliedAt: new Date().toISOString(),
    };
  }

  try {
    acquireLock(ctx);
  } catch (error) {
    return {
      schemaVersion: '1.0.0',
      planId: plan.planId,
      planHash: plan.planHash,
      status: 'failed',
      applied: [],
      errors: [workspaceDiagnostic('error', 'WORKSPACE_MIGRATION_FAILED',
        error instanceof Error ? error.message : String(error))],
      warnings: [],
      appliedAt: new Date().toISOString(),
    };
  }

  const applied: string[] = [];
  let backupId: string | undefined;
  try {
    // re-scan for drift
    const again = planMigrations(ctx);
    if (again.planHash !== plan.planHash) {
      return {
        schemaVersion: '1.0.0',
        planId: plan.planId,
        planHash: plan.planHash,
        status: 'failed',
        applied: [],
        errors: [workspaceDiagnostic('error', 'WORKSPACE_MIGRATION_DRIFT',
          'Data changed after plan; refuse to apply')],
        warnings: [],
        appliedAt: new Date().toISOString(),
      };
    }

    for (const entry of plan.migrations) {
      const def = MIGRATION_REGISTRY.find((m) => m.id === entry.migrationId);
      if (!def) continue;
      if (entry.requiresBackup && entry.affectedRecords > 0) {
        const prefsDir = join(ctx.migrationRoot, 'preferences');
        const files = existsSync(prefsDir)
          ? readdirSync(prefsDir).filter((f) => f.endsWith('.json')).map((f) => join(prefsDir, f))
          : [];
        backupId = createBackup(ctx, entry.area, files);
      }
      const result = def.apply(ctx, []);
      if (result.errors.length || result.failedRecordId) {
        return {
          schemaVersion: '1.0.0',
          planId: plan.planId,
          planHash: plan.planHash,
          status: 'failed',
          applied,
          failedRecordId: result.failedRecordId,
          backupId,
          errors: result.errors.length
            ? result.errors
            : [workspaceDiagnostic('error', 'WORKSPACE_MIGRATION_FAILED', 'Migration failed')],
          warnings: [],
          appliedAt: new Date().toISOString(),
        };
      }
      applied.push(def.id);
      writeAreaVersion(ctx, def.area, def.toVersion);
    }

    // write receipt
    const receipt: WorkspaceMigrationReceiptV1 = {
      schemaVersion: '1.0.0',
      planId: plan.planId,
      planHash: plan.planHash,
      status: applied.length === 0 ? 'noop' : 'applied',
      applied,
      backupId,
      errors: [],
      warnings: [],
      appliedAt: new Date().toISOString(),
    };
    const receiptDir = join(ctx.migrationRoot, 'receipts');
    mkdirSync(receiptDir, { recursive: true });
    writeFileSync(
      join(receiptDir, `${plan.planId}.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
      'utf8',
    );
    return receipt;
  } finally {
    releaseLock(ctx);
  }
}

export { listDataVersions };
