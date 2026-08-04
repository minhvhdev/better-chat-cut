# Desktop security (M7B)

- `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`
- `sandbox: true` where enabled
- Permission requests denied by default
- `window.open` denied; cross-origin navigation blocked
- Minimal preload allowlist (directory / export destination only)
- OAuth never loads provider pages in privileged renderer
