# Workspace backup / restore v1

Profiles:

- `workflows-only` — production/publishing run stores without media bulk
- `complete-local-workspace` — projects, media references, runs, bundles

Restore requires explicit destructive confirmation. Credentials are excluded from backups; connections mark reauthentication-required after restore. Manifests use logical paths (no absolute host paths).

Verify:

- `npm run verify:better-chat-cut-backup-restore`
- `npm run verify:better-chat-cut-backup-restore:e2e`
