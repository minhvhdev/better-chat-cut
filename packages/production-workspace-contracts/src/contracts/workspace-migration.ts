import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';

export type WorkspaceMigrationArea =
  | 'production-runs'
  | 'publishing-runs'
  | 'workspace-preferences'
  | 'scene-drafts'
  | 'narration'
  | 'deliveries';

export type WorkspaceMigrationPlanEntryV1 = {
  migrationId: string;
  area: WorkspaceMigrationArea | string;
  affectedRecords: number;
  destructive: boolean;
  requiresBackup: boolean;
  warnings: WorkspaceDiagnostic[];
};

export type WorkspaceMigrationPlanV1 = {
  schemaVersion: '1.0.0';
  planId: string;
  migrations: WorkspaceMigrationPlanEntryV1[];
  backupRequired: boolean;
  planHash: string;
};

export type WorkspaceMigrationReceiptV1 = {
  schemaVersion: '1.0.0';
  planId: string;
  planHash: string;
  status: 'applied' | 'failed' | 'noop';
  applied: string[];
  failedRecordId?: string;
  backupId?: string;
  errors: WorkspaceDiagnostic[];
  warnings: WorkspaceDiagnostic[];
  appliedAt: string;
};

export type WorkspaceMigrationApplyInputV1 = {
  planId: string;
  planHash: string;
  dryRun?: boolean;
  confirmDestructive?: boolean;
};
