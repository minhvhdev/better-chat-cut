# Upgrade and rollback (M7B)

- Upgrade: install over previous fixture, run migration plan with pre-backup, validate stores.
- Rollback: older binaries must not silently write future schemas; restore pre-upgrade backup for safe retreat.
- Binary rollback is **not** claimed lossless without restore.
