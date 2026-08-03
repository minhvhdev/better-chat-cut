import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type WorkspaceMigrationSummaryV1,
  type WorkspaceDiagnostic,
  workspaceDiagnostic,
} from '../../../production-workspace-contracts/src/index.ts';

export type MigrationAreaVersions = Record<string, string>;

export type WorkspaceMigrationDefinitionV1 = {
  id: string;
  area:
    | 'production-runs'
    | 'publishing-runs'
    | 'workspace-preferences'
    | 'scene-drafts'
    | 'narration'
    | 'deliveries';
  fromVersion: string;
  toVersion: string;
  description: string;
  destructive: boolean;
  requiresBackup: boolean;
  plan: (ctx: MigrationScanContext) => {
    affectedRecords: number;
    warnings: WorkspaceDiagnostic[];
  };
  apply: (ctx: MigrationScanContext, recordIds: string[]) => {
    applied: string[];
    failedRecordId?: string;
    errors: WorkspaceDiagnostic[];
  };
};

export type MigrationScanContext = {
  productionRoot: string;
  publishingRoot: string;
  migrationRoot: string;
  backupRoot?: string;
};

const CURRENT_VERSIONS: MigrationAreaVersions = {
  'production-runs': '1.0.0',
  'publishing-runs': '1.0.0',
  'workspace-preferences': '1.0.0',
  'scene-drafts': '1.0.0',
  'narration': '1.0.0',
  'deliveries': '1.0.0',
};

/** Synthetic fixture migration: workspace-preferences 0.9.0 -> 1.0.0 */
export const PREFS_V09_TO_V10: WorkspaceMigrationDefinitionV1 = {
  id: 'workspace-preferences.0.9.0-to-1.0.0',
  area: 'workspace-preferences',
  fromVersion: '0.9.0',
  toVersion: '1.0.0',
  description: 'Upgrade workspace preferences schema marker from 0.9.0 to 1.0.0',
  destructive: false,
  requiresBackup: true,
  plan(ctx) {
    const prefsDir = join(ctx.migrationRoot, 'preferences');
    if (!existsSync(prefsDir)) return { affectedRecords: 0, warnings: [] };
    const files = readdirSync(prefsDir).filter((f) => f.endsWith('.json'));
    let affected = 0;
    const warnings: WorkspaceDiagnostic[] = [];
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(prefsDir, file), 'utf8')) as { schemaVersion?: string };
        if (raw.schemaVersion === '0.9.0') affected += 1;
        else if (raw.schemaVersion && raw.schemaVersion !== '0.9.0' && raw.schemaVersion !== '1.0.0') {
          warnings.push(workspaceDiagnostic(
            'warning',
            'WORKSPACE_MIGRATION_UNSUPPORTED',
            `Unsupported preferences version ${raw.schemaVersion} in ${file}`,
            { recovery: 'Do not auto-migrate future schemas; upgrade app first' },
          ));
        }
      } catch {
        warnings.push(workspaceDiagnostic('warning', 'WORKSPACE_MIGRATION_FAILED', `Unreadable preferences ${file}`));
      }
    }
    return { affectedRecords: affected, warnings };
  },
  apply(ctx, _recordIds) {
    const prefsDir = join(ctx.migrationRoot, 'preferences');
    mkdirSync(prefsDir, { recursive: true });
    const files = readdirSync(prefsDir).filter((f) => f.endsWith('.json'));
    const applied: string[] = [];
    const errors: WorkspaceDiagnostic[] = [];
    for (const file of files) {
      const path = join(prefsDir, file);
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
        if (raw.schemaVersion === '0.9.0') {
          raw.schemaVersion = '1.0.0';
          if (raw.filters && typeof raw.filters === 'object') {
            // no-op structural normalize
          }
          writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
          applied.push(file.replace(/\.json$/, ''));
        } else if (raw.schemaVersion && raw.schemaVersion !== '1.0.0') {
          return {
            applied,
            failedRecordId: file.replace(/\.json$/, ''),
            errors: [workspaceDiagnostic(
              'error',
              'WORKSPACE_MIGRATION_UNSUPPORTED',
              `Unsupported future schema version ${String(raw.schemaVersion)}`,
              { recovery: 'Preserve original data; do not apply automated repairs' },
            )],
          };
        }
      } catch (error) {
        return {
          applied,
          failedRecordId: file.replace(/\.json$/, ''),
          errors: [workspaceDiagnostic(
            'error',
            'WORKSPACE_MIGRATION_FAILED',
            error instanceof Error ? error.message : String(error),
          )],
        };
      }
    }
    return { applied, errors };
  },
};

export const MIGRATION_REGISTRY: WorkspaceMigrationDefinitionV1[] = [
  PREFS_V09_TO_V10,
];

export function readAreaVersion(ctx: MigrationScanContext, area: string): string {
  const marker = join(ctx.migrationRoot, 'versions', `${area}.json`);
  if (!existsSync(marker)) return CURRENT_VERSIONS[area] ?? '1.0.0';
  try {
    const raw = JSON.parse(readFileSync(marker, 'utf8')) as { version?: string };
    return raw.version ?? CURRENT_VERSIONS[area] ?? '1.0.0';
  } catch {
    return CURRENT_VERSIONS[area] ?? '1.0.0';
  }
}

export function writeAreaVersion(ctx: MigrationScanContext, area: string, version: string): void {
  const dir = join(ctx.migrationRoot, 'versions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${area}.json`), `${JSON.stringify({ version }, null, 2)}\n`, 'utf8');
}

export function listPendingMigrations(ctx: MigrationScanContext): WorkspaceMigrationSummaryV1[] {
  const out: WorkspaceMigrationSummaryV1[] = [];
  for (const m of MIGRATION_REGISTRY) {
    const planned = m.plan(ctx);
    if (planned.affectedRecords > 0 || planned.warnings.some((w) => w.code === 'WORKSPACE_MIGRATION_UNSUPPORTED')) {
      out.push({
        migrationId: m.id,
        area: m.area,
        fromVersion: m.fromVersion,
        toVersion: m.toVersion,
        description: m.description,
        destructive: m.destructive,
        requiresBackup: m.requiresBackup,
        affectedRecords: planned.affectedRecords,
      });
    }
  }
  return out;
}

export function listDataVersions(ctx: MigrationScanContext): { area: string; version: string }[] {
  return Object.keys(CURRENT_VERSIONS).map((area) => ({
    area,
    version: readAreaVersion(ctx, area),
  }));
}

export { CURRENT_VERSIONS };
