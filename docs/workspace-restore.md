# Workspace restore (M7B)

1. Validate backup hashes.
2. Plan restore with conflict table (exists / schema-newer / hash-mismatch).
3. Non-overwrite default: `keep-current`.
4. Destructive apply requires `confirmDestructive=true`.
5. Pre-restore workflows-only backup is created first.
6. Staged apply then report; connections require reauthentication.
