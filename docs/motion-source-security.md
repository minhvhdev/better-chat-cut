# Motion Source Security

## Threat model

Agents can write TypeScript/TSX for motion assets. That code must not run with Node privileges, access secrets, network, or the filesystem.

## Trust boundaries

1. **Static AST validation** (TypeScript API) — imports, globals, JSX, determinism.
2. **Restricted compile** — strip SDK imports; Babel classic JSX; bundle inspection.
3. **Remotion Chromium sandbox** — `new Function` whitelist/shadow patterned after `src/template-host.ts`.
4. **Lifecycle gates** — only staging/published verified descriptors enter the composite runtime registry.

## Why not `node:vm` alone

`node:vm` is not treated as a security boundary. Authored bundles are never executed in the MCP/server process via `import()` or `node:vm`.

## Policies

| Area | Rule |
|---|---|
| Imports | Only `@better-chat-cut/motion-sdk` |
| Globals | Block `process`, `fetch`, `eval`, `Date`, `Math.random`, timers, DOM, storage, WASM, … |
| JSX | No `script`, `foreignObject`, `dangerouslySetInnerHTML`, `on*`, external `href` |
| Filesystem | Server-built paths under user catalog; no `..` / absolute client paths |
| Network | No fetch/WebSocket in source; Chromium render has no authored network APIs |
| Size | 128KiB source / 512KiB bundle |
| Candidate vs verified | Draft builds preview only; staging/published load into registry |

Known limitation: restricted `Function` hardening is defense-in-depth, not a perfect isolate; production Remotion Chromium remains the execution host.
