# Desktop distribution (Better Chat Cut M7B / M7B.1)

Desktop packaging reuses the existing Electron + electron-builder pipeline (`desktop:dist*`).

Better Chat Cut adds:

- Distribution contracts (`packages/desktop-distribution-contracts`)
- Distribution plan/build operations (`packages/desktop-distribution`)
- Stub/dry-run artifacts for development planning only (marked `buildMode=stub`, `dryRun=true`, `stub=true`)
- Real current-host packages via `npm run verify:better-chat-cut-desktop-distribution:current-host` (`buildMode=real`, `dryRun=false`, `stub=false`)
- Launch smoke via `npm run verify:better-chat-cut-desktop-distribution:smoke`

Roadmap closure **rejects** stub/dry-run packages as target evidence.

Automatic updates are **not** implemented. See [manual-update-policy.md](manual-update-policy.md).
