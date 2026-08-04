# Manual update policy (M7B)

Better Chat Cut does **not** auto-download or auto-install desktop updates.

Operators download artifacts from a trusted channel, verify SHA-256 against the distribution / release-candidate manifest, then install manually.

`releaseFeedConfigured`, `automaticDownload`, and `automaticInstall` are fixed `false`.
