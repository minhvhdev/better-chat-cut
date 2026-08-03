# Better Chat Cut data migrations

Registry-based workspace migrations under production-workspace-services.

## Flow

1. `plan` → `WorkspaceMigrationPlanV1` with `planHash` (timestamp-free)
2. Re-scan on apply; refuse on drift
3. Acquire migration lock
4. Backup affected records when `requiresBackup`
5. Apply record-by-record; abort with failed logical ID
6. Write receipt; release lock

## Fixture migration

`workspace-preferences.0.9.0-to-1.0.0` upgrades synthetic preference records.

## Rules

No automatic destructive migrations. Unsupported future schemas blocked. Backups kept under workspace backup root; no auto-delete.
