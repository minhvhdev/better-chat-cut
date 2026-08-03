import type { WorkspaceDiagnostic } from './workspace-diagnostic.ts';

export type WorkspaceHealthCheckCategory =
  | 'runtime'
  | 'storage'
  | 'data-integrity'
  | 'operations'
  | 'projects'
  | 'render'
  | 'publishing'
  | 'credentials'
  | 'migrations'
  | 'desktop';

export type WorkspaceHealthCheckV1 = {
  id: string;
  category: WorkspaceHealthCheckCategory;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  summary: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export type WorkspaceMigrationSummaryV1 = {
  migrationId: string;
  area: string;
  fromVersion: string;
  toVersion: string;
  description: string;
  destructive: boolean;
  requiresBackup: boolean;
  affectedRecords?: number;
};

export type WorkspaceHealthOptionsV1 = {
  mode?: 'quick' | 'deep';
  includeMigrations?: boolean;
  includeDesktop?: boolean;
};

export type WorkspaceHealthReportV1 = {
  schemaVersion: '1.0.0';
  status: 'healthy' | 'warning' | 'error';
  mode: 'quick' | 'deep';
  checks: WorkspaceHealthCheckV1[];
  migrations: {
    required: boolean;
    pending: WorkspaceMigrationSummaryV1[];
  };
  generatedAt: string;
  errors: WorkspaceDiagnostic[];
  warnings: WorkspaceDiagnostic[];
};
