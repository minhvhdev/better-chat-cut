# Workspace backup bundle v1 (M7B)

`PortableBackupBundleV1` under `BETTER_CHAT_CUT_BACKUP_ROOT`.

Profiles:

- `workflows-only` — projects, assets, drafts, production/publishing runs, deliveries, preferences, connection **metadata** (reauth marker)
- `complete-local-workspace` — includes media blobs

Always excludes OAuth tokens. Manifest lists logical paths (`logical://…`) and SHA-256 per file.
