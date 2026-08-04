import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir, writeFile, readFile, rename, unlink, readdir, stat, cp, rm,
} from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import type {
  BackupAreaV1,
  BackupManifestV1,
  BackupOperationV1,
  BackupPlanV1,
  BackupProfile,
  BackupRequestV1,
  RestoreConflictV1,
  RestorePlanV1,
  RestoreReportV1,
} from '../contracts/backup-types.ts';
import { BackupError } from '../contracts/backup-errors.ts';

function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function resolveBackupRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BETTER_CHAT_CUT_BACKUP_ROOT) return env.BETTER_CHAT_CUT_BACKUP_ROOT;
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'backups');
}

export function resolveWorkspaceDataRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BETTER_CHAT_CUT_WORKSPACE_DATA_ROOT) return env.BETTER_CHAT_CUT_WORKSPACE_DATA_ROOT;
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'workspace-data');
}

const AREA_DEFS: Array<{ id: BackupAreaV1['id']; logicalRoot: string; completeOnly?: boolean }> = [
  { id: 'projects', logicalRoot: 'logical://projects' },
  { id: 'media', logicalRoot: 'logical://media', completeOnly: true },
  { id: 'assets', logicalRoot: 'logical://assets' },
  { id: 'scene-drafts', logicalRoot: 'logical://scene-drafts' },
  { id: 'production-runs', logicalRoot: 'logical://production-runs' },
  { id: 'publishing-runs', logicalRoot: 'logical://publishing-runs' },
  { id: 'deliveries', logicalRoot: 'logical://deliveries' },
  { id: 'workspace-preferences', logicalRoot: 'logical://workspace-preferences' },
  { id: 'connection-metadata', logicalRoot: 'logical://connection-metadata' },
];

function areasForProfile(profile: BackupProfile): BackupAreaV1[] {
  return AREA_DEFS.map((a) => ({
    id: a.id,
    logicalRoot: a.logicalRoot,
    included: profile === 'complete-local-workspace' || !a.completeOnly,
  }));
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, path);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
}

async function walkFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const ent of entries) {
      const p = join(current, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile()) out.push(p);
    }
  }
  await walk(dir);
  return out;
}

export type BackupRestoreServiceOptions = {
  backupRoot?: string;
  dataRoot?: string;
  appVersion?: string;
};

export type BackupRestoreService = {
  getContract: (format?: 'summary' | 'full') => Record<string, unknown>;
  planBackup: (request: BackupRequestV1) => Promise<BackupPlanV1>;
  createBackup: (plan: BackupPlanV1) => Promise<BackupOperationV1>;
  getOperation: (operationId: string) => Promise<BackupOperationV1 | null>;
  validateBackup: (backupId: string) => Promise<{ valid: boolean; manifest?: BackupManifestV1; errors: string[] }>;
  planRestore: (backupId: string, options?: { dryRun?: boolean }) => Promise<RestorePlanV1>;
  applyRestore: (
    plan: RestorePlanV1,
    options?: { confirmDestructive?: boolean; resolutions?: Record<string, RestoreConflictV1['resolution']> },
  ) => Promise<BackupOperationV1>;
  getRestoreReport: (restoreId: string) => Promise<RestoreReportV1 | null>;
  seedFixtureArea: (areaId: string, fileName: string, content: string) => Promise<void>;
};

export function createBackupRestoreService(
  options: BackupRestoreServiceOptions = {},
): BackupRestoreService {
  const backupRoot = options.backupRoot ?? resolveBackupRoot();
  const dataRoot = options.dataRoot ?? resolveWorkspaceDataRoot();
  const require = createRequire(import.meta.url);
  let appVersion = options.appVersion;
  if (!appVersion) {
    try {
      appVersion = (require('../../../package.json') as { version: string }).version;
    } catch {
      appVersion = '0.0.0';
    }
  }

  async function saveOp(op: BackupOperationV1): Promise<void> {
    await atomicWriteJson(join(backupRoot, 'operations', op.operationId, 'operation.json'), op);
  }

  async function loadOp(id: string): Promise<BackupOperationV1 | null> {
    try {
      return JSON.parse(await readFile(join(backupRoot, 'operations', id, 'operation.json'), 'utf8')) as BackupOperationV1;
    } catch {
      return null;
    }
  }

  function areaDir(areaId: string): string {
    return join(dataRoot, areaId);
  }

  return {
    getContract(format = 'summary') {
      const base = {
        schemaVersion: '1.0.0',
        milestone: 'M7B',
        profiles: ['workflows-only', 'complete-local-workspace'],
        includeCredentialsDefault: false,
        credentialsNeverBackedUp: true,
        restoreRequiresConfirm: true,
        preRestoreBackup: true,
        pathPortability: 'logical:// roots only',
      };
      if (format === 'full') {
        return {
          ...base,
          areas: AREA_DEFS,
          tools: [
            'backup_get_contract', 'backup_plan', 'backup_create', 'backup_status', 'backup_validate',
            'restore_plan', 'restore_apply', 'restore_status',
          ],
        };
      }
      return base;
    },
    async planBackup(request) {
      if (request.schemaVersion !== '1.0.0') throw new BackupError('BACKUP_VALIDATION_FAILED', 'schema');
      if (request.includeCredentials) {
        throw new BackupError('BACKUP_FORBIDDEN', 'Credentials must not be included in backups');
      }
      if (request.profile !== 'workflows-only' && request.profile !== 'complete-local-workspace') {
        throw new BackupError('BACKUP_PLAN_INVALID', 'Invalid profile');
      }
      const areas = areasForProfile(request.profile);
      let estimatedBytes = 0;
      for (const area of areas.filter((a) => a.included)) {
        const files = await walkFiles(areaDir(area.id));
        for (const f of files) {
          estimatedBytes += (await stat(f)).size;
        }
        area.estimatedBytes = files.length;
      }
      const planWithoutHash = {
        schemaVersion: '1.0.0' as const,
        planId: `backup-plan.${request.id}`,
        requestId: request.id,
        profile: request.profile,
        areas,
        includeCredentials: false as const,
        estimatedBytes,
      };
      const planHash = sha256Hex(stableStringify(planWithoutHash));
      return { ...planWithoutHash, planHash, preparedAt: new Date().toISOString() };
    },
    async createBackup(plan) {
      if (plan.includeCredentials !== false) {
        throw new BackupError('BACKUP_FORBIDDEN', 'Credentials excluded');
      }
      const expectedHash = sha256Hex(stableStringify({
        schemaVersion: plan.schemaVersion,
        planId: plan.planId,
        requestId: plan.requestId,
        profile: plan.profile,
        areas: plan.areas,
        includeCredentials: false,
        estimatedBytes: plan.estimatedBytes,
      }));
      if (expectedHash !== plan.planHash) {
        throw new BackupError('BACKUP_PLAN_INVALID', 'planHash mismatch');
      }

      const operationId = `backup-op.${randomUUID().slice(0, 8)}`;
      const backupId = `backup.${randomUUID().slice(0, 8)}`;
      const op: BackupOperationV1 = {
        schemaVersion: '1.0.0',
        operationId,
        kind: 'backup',
        status: 'running',
        backupId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveOp(op);

      try {
        const bundleDir = join(backupRoot, 'bundles', backupId, 'files');
        await mkdir(bundleDir, { recursive: true });
        const files: BackupManifestV1['files'] = [];

        for (const area of plan.areas.filter((a) => a.included)) {
          if (area.id === 'connection-metadata') {
            // Store reauthentication marker only — never vault tokens
            const logicalPath = `${area.logicalRoot}/reauthentication-required.json`;
            const rel = join(area.id, 'reauthentication-required.json');
            const content = Buffer.from(JSON.stringify({
              schemaVersion: '1.0.0',
              reauthenticationRequired: true,
              message: 'Restored connections require interactive OAuth reauthentication',
            }), 'utf8');
            await mkdir(join(bundleDir, area.id), { recursive: true });
            await writeFile(join(bundleDir, rel), content, { mode: 0o600 });
            files.push({
              logicalPath,
              relativePath: rel.replace(/\\/g, '/'),
              byteLength: content.byteLength,
              sha256: sha256Hex(content),
            });
            continue;
          }
          const src = areaDir(area.id);
          const walked = await walkFiles(src);
          for (const abs of walked) {
            const relWithin = relative(src, abs);
            // Portability: reject absolute & parent traversal
            if (relWithin.includes('..') || relWithin.startsWith(sep)) {
              throw new BackupError('BACKUP_VALIDATION_FAILED', 'Path portability violation');
            }
            const rel = join(area.id, relWithin).replace(/\\/g, '/');
            const dest = join(bundleDir, rel);
            await mkdir(join(dest, '..'), { recursive: true });
            await cp(abs, dest);
            const buf = await readFile(dest);
            // Secret scan: refuse token-looking values
            if (/ya29\.|fake-access\.|fake-refresh\.|BEGIN PRIVATE KEY/i.test(buf.toString('utf8'))) {
              throw new BackupError('BACKUP_FORBIDDEN', 'Refusing to backup possible credential material');
            }
            files.push({
              logicalPath: `${area.logicalRoot}/${relWithin.replace(/\\/g, '/')}`,
              relativePath: rel,
              byteLength: buf.byteLength,
              sha256: sha256Hex(buf),
            });
          }
        }

        const manifestBase = {
          schemaVersion: '1.0.0' as const,
          backupId,
          planId: plan.planId,
          planHash: plan.planHash,
          profile: plan.profile,
          includeCredentials: false as const,
          files,
          connectionReauthenticationRequired: true as const,
          platform: process.platform,
          appVersion: appVersion!,
        };
        const manifest: BackupManifestV1 = {
          ...manifestBase,
          manifestHash: sha256Hex(stableStringify(manifestBase)),
          createdAt: new Date().toISOString(),
        };
        await atomicWriteJson(join(backupRoot, 'bundles', backupId, 'manifest.json'), manifest);
        op.status = 'completed';
        op.updatedAt = new Date().toISOString();
        await saveOp(op);
        return op;
      } catch (e) {
        op.status = 'failed';
        op.error = {
          code: e instanceof BackupError ? e.code : 'BACKUP_VALIDATION_FAILED',
          message: e instanceof Error ? e.message : String(e),
        };
        op.updatedAt = new Date().toISOString();
        await saveOp(op);
        return op;
      }
    },
    async getOperation(operationId) {
      return loadOp(operationId);
    },
    async validateBackup(backupId) {
      const errors: string[] = [];
      try {
        const manifest = JSON.parse(
          await readFile(join(backupRoot, 'bundles', backupId, 'manifest.json'), 'utf8'),
        ) as BackupManifestV1;
        if (manifest.includeCredentials !== false) errors.push('credentials flag invalid');
        if (!manifest.connectionReauthenticationRequired) errors.push('must require reauthentication');
        for (const f of manifest.files) {
          if (f.relativePath.includes('..') || f.relativePath.startsWith('/')) {
            errors.push(`bad path ${f.relativePath}`);
            continue;
          }
          const abs = join(backupRoot, 'bundles', backupId, 'files', f.relativePath);
          const buf = await readFile(abs);
          if (sha256Hex(buf) !== f.sha256) errors.push(`hash mismatch ${f.relativePath}`);
        }
        return { valid: errors.length === 0, manifest, errors };
      } catch (e) {
        return { valid: false, errors: [e instanceof Error ? e.message : String(e)] };
      }
    },
    async planRestore(backupId, options) {
      const dryRun = options?.dryRun !== false;
      const validation = await this.validateBackup(backupId);
      if (!validation.valid || !validation.manifest) {
        throw new BackupError('RESTORE_VALIDATION_FAILED', validation.errors.join('; '));
      }
      const conflicts: RestoreConflictV1[] = [];
      for (const f of validation.manifest.files) {
        const [areaId, ...rest] = f.relativePath.split('/');
        const dest = join(areaDir(areaId!), rest.join('/'));
        if (existsSync(dest)) {
          conflicts.push({
            conflictId: `conflict.${sha256Hex(f.relativePath).slice(0, 8)}`,
            logicalPath: f.logicalPath,
            reason: 'exists',
          });
        }
      }
      const planWithoutHash = {
        schemaVersion: '1.0.0' as const,
        planId: `restore-plan.${backupId}`,
        backupId,
        dryRun,
        conflicts,
        requiresPreRestoreBackup: true,
      };
      return {
        ...planWithoutHash,
        planHash: sha256Hex(stableStringify(planWithoutHash)),
        preparedAt: new Date().toISOString(),
      };
    },
    async applyRestore(plan, options) {
      const confirm = options?.confirmDestructive === true;
      if (!plan.dryRun && !confirm) {
        throw new BackupError('RESTORE_FORBIDDEN', 'Destructive restore requires confirmDestructive=true');
      }
      const unresolved = plan.conflicts.filter((c) => {
        const res = options?.resolutions?.[c.conflictId] ?? c.resolution;
        return !res || res === undefined;
      });
      if (!plan.dryRun && unresolved.length > 0) {
        // Default: keep-current (never silent overwrite)
        for (const c of unresolved) {
          c.resolution = 'keep-current';
        }
      }

      const operationId = `restore-op.${randomUUID().slice(0, 8)}`;
      const restoreId = `restore.${randomUUID().slice(0, 8)}`;
      const op: BackupOperationV1 = {
        schemaVersion: '1.0.0',
        operationId,
        kind: 'restore',
        status: 'running',
        restoreId,
        backupId: plan.backupId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveOp(op);

      try {
        let preRestoreBackupId: string | undefined;
        if (!plan.dryRun && plan.requiresPreRestoreBackup) {
          const prePlan = await this.planBackup({
            schemaVersion: '1.0.0',
            id: `pre-restore.${restoreId}`,
            name: 'Pre-restore safety backup',
            profile: 'workflows-only',
            includeCredentials: false,
          });
          const preOp = await this.createBackup(prePlan);
          preRestoreBackupId = preOp.backupId;
        }

        const validation = await this.validateBackup(plan.backupId);
        if (!validation.valid || !validation.manifest) {
          throw new BackupError('RESTORE_VALIDATION_FAILED', 'Invalid backup');
        }

        let applied = 0;
        let skipped = 0;
        if (!plan.dryRun) {
          const staging = join(backupRoot, 'staging', restoreId);
          await mkdir(staging, { recursive: true });
          await cp(join(backupRoot, 'bundles', plan.backupId, 'files'), join(staging, 'files'), { recursive: true });

          for (const f of validation.manifest.files) {
            const conflict = plan.conflicts.find((c) => c.logicalPath === f.logicalPath);
            const resolution = conflict
              ? (options?.resolutions?.[conflict.conflictId] ?? conflict.resolution ?? 'keep-current')
              : 'overwrite';
            const [areaId, ...rest] = f.relativePath.split('/');
            const dest = join(areaDir(areaId!), ...rest);
            if (conflict && resolution === 'keep-current') {
              skipped += 1;
              continue;
            }
            await mkdir(join(dest, '..'), { recursive: true });
            await cp(join(staging, 'files', f.relativePath), dest);
            applied += 1;
          }
          await rm(staging, { recursive: true, force: true });
        } else {
          applied = 0;
          skipped = plan.conflicts.length;
        }

        const reportBase = {
          schemaVersion: '1.0.0' as const,
          restoreId,
          backupId: plan.backupId,
          status: plan.dryRun ? 'dry-run' as const : 'completed' as const,
          appliedFiles: applied,
          skippedFiles: skipped,
          preRestoreBackupId,
          connectionReauthenticationRequired: true as const,
        };
        const report: RestoreReportV1 = {
          ...reportBase,
          reportHash: sha256Hex(stableStringify(reportBase)),
          generatedAt: new Date().toISOString(),
        };
        await atomicWriteJson(join(backupRoot, 'operations', operationId, 'restore-report.json'), report);
        op.status = 'completed';
        op.updatedAt = new Date().toISOString();
        await saveOp(op);
        return op;
      } catch (e) {
        op.status = 'failed';
        op.error = {
          code: e instanceof BackupError ? e.code : 'RESTORE_VALIDATION_FAILED',
          message: e instanceof Error ? e.message : String(e),
        };
        op.updatedAt = new Date().toISOString();
        await saveOp(op);
        return op;
      }
    },
    async getRestoreReport(restoreId) {
      const opsDir = join(backupRoot, 'operations');
      if (!existsSync(opsDir)) return null;
      for (const id of await readdir(opsDir)) {
        try {
          const report = JSON.parse(
            await readFile(join(opsDir, id, 'restore-report.json'), 'utf8'),
          ) as RestoreReportV1;
          if (report.restoreId === restoreId) return report;
        } catch { /* next */ }
      }
      return null;
    },
    async seedFixtureArea(areaId, fileName, content) {
      const dir = areaDir(areaId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, fileName), content, 'utf8');
    },
  };
}
