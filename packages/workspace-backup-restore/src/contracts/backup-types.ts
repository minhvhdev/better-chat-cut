export type BackupProfile = 'workflows-only' | 'complete-local-workspace';

export type BackupAreaId =
  | 'projects'
  | 'media'
  | 'assets'
  | 'scene-drafts'
  | 'production-runs'
  | 'publishing-runs'
  | 'deliveries'
  | 'workspace-preferences'
  | 'connection-metadata';

export type BackupAreaV1 = {
  id: BackupAreaId;
  included: boolean;
  logicalRoot: string;
  estimatedBytes?: number;
  notes?: string;
};

export type BackupRequestV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  profile: BackupProfile;
  /** Credentials are never included by default. */
  includeCredentials?: false;
};

export type BackupPlanV1 = {
  schemaVersion: '1.0.0';
  planId: string;
  requestId: string;
  profile: BackupProfile;
  areas: BackupAreaV1[];
  includeCredentials: false;
  estimatedBytes: number;
  planHash: string;
  preparedAt: string;
};

export type BackupManifestV1 = {
  schemaVersion: '1.0.0';
  backupId: string;
  planId: string;
  planHash: string;
  profile: BackupProfile;
  includeCredentials: false;
  files: Array<{
    logicalPath: string;
    relativePath: string;
    byteLength: number;
    sha256: string;
  }>;
  connectionReauthenticationRequired: true;
  platform: string;
  appVersion: string;
  manifestHash: string;
  createdAt: string;
};

export type RestoreConflictV1 = {
  conflictId: string;
  logicalPath: string;
  reason: 'exists' | 'schema-newer' | 'hash-mismatch';
  resolution?: 'keep-current' | 'overwrite' | 'merge';
};

export type RestorePlanV1 = {
  schemaVersion: '1.0.0';
  planId: string;
  backupId: string;
  dryRun: boolean;
  conflicts: RestoreConflictV1[];
  requiresPreRestoreBackup: boolean;
  planHash: string;
  preparedAt: string;
};

export type RestoreReportV1 = {
  schemaVersion: '1.0.0';
  restoreId: string;
  backupId: string;
  status: 'completed' | 'failed' | 'dry-run';
  appliedFiles: number;
  skippedFiles: number;
  preRestoreBackupId?: string;
  connectionReauthenticationRequired: true;
  reportHash: string;
  generatedAt: string;
};

export type BackupOperationV1 = {
  schemaVersion: '1.0.0';
  operationId: string;
  kind: 'backup' | 'restore';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  percent?: number;
  backupId?: string;
  restoreId?: string;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
};
