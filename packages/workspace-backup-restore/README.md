# Workspace backup & restore (M7B)

Portable backup bundles under `BETTER_CHAT_CUT_BACKUP_ROOT`:

- Profiles: `workflows-only`, `complete-local-workspace`
- Credentials never included
- Logical path roots (`logical://…`) for cross-platform portability
- Restores require `confirmDestructive`, create pre-restore backup, and mark connections for reauthentication
