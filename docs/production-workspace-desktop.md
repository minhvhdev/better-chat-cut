# Production Workspace desktop

Web (Vite) and Electron embedded server share plugin assembly (`server/plugins/index.ts`), including workspace HTTP APIs.

## Verified

- `desktop:build:main` builds main/preload
- Hash navigation to `#/production-workspace`
- Same same-origin workspace API on desktop host when embedded server mounts plugins

## Not in M7A

Signed installers, notarization, auto-update, full RC smoke matrix (M7B).

## Restart

Reload workspace after app restart; runs resume from durable production/publishing stores via orchestrators.
