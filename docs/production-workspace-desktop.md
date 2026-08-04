# Production Workspace desktop

Web (Vite) and Electron embedded server share plugin assembly (`server/plugins/index.ts`), including workspace + M7B finalization HTTP APIs.

## Verified

- `desktop:build:main` builds main/preload
- Hash navigation to `#/production-workspace`
- BrowserWindow hardening: contextIsolation, no nodeIntegration, webSecurity, permission deny-by-default
- Same-origin workspace / distribution / backup / OAuth APIs on embedded desktop host

## M7B packaging

- Plans and checksum manifests via distribution service
- Real installers via `desktop:dist*` and CI matrix (`.github/workflows/desktop.yml`)
- Signing/notarization when external secrets configured; otherwise truthful `not-configured`
- Update policy is manual only (no auto-updater)
