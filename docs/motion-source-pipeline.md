# Motion Source Pipeline (M2B)

Agent-authored motion assets follow a restricted pipeline. Source is stored under the M1B user catalog; execution happens only inside Remotion Chromium.

## Flow

```text
draft source (index.tsx)
  → AST validation + type/export/import checks
  → restricted compile (Babel) → runtime/<buildHash>/component.js
  → candidate Remotion preview (bundle string as inputProps)
  → prepare-staging (previews + manifest update, still draft)
  → asset_transition_status → staging|published
  → verified user runtime registry (composite with built-ins)
```

## Storage layout

```text
<user-catalog-root>/<assetId>/
  <version>.asset.json
  <version>/
    source/index.tsx
    runtime/<buildHash>/{component.js,runtime-descriptor.json,build-receipt.json}
    previews/<buildHash>/{still.png,contact-sheet.png}
    _meta/{source-events.jsonl,source-operations/}
```

Paths are server-resolved only (no client paths, no `..`).

## Execution boundary

- Node MCP/server: validate, type-check, transform, write artifacts, call `renderStill`.
- Never `import()` / `node:vm` of authored bundles in Node.
- Remotion Chromium: `SandboxedUserMotion` evaluates the bundle with template-host style whitelist + shadowed globals.

## MCP tools

| Tool | Role |
|---|---|
| `motion_source_get_contract` | SDK/template contract |
| `motion_asset_source_get` | Read source |
| `motion_asset_source_put` | Write source (`dryRun` default true) |
| `motion_asset_source_validate` | Validate only |
| `motion_asset_source_build` | Immutable candidate build |
| `motion_asset_source_render_preview` | Candidate still/contact-sheet (`__images`) |
| `motion_asset_prepare_staging` | Build+preview+manifest (`dryRun` default true) |

Prepare does **not** transition status; call `asset_transition_status` with `staging` afterward.

## Verification

```bash
npm run verify:better-chat-cut-motion-source          # fast (skip Remotion)
npm run verify:better-chat-cut-motion-source:render   # real Remotion Chromium
```

Temp user catalog roots are set via `BETTER_CHAT_CUT_USER_ASSET_CATALOG_ROOT`.

See also: [motion-authoring-sdk.md](./motion-authoring-sdk.md), [motion-source-security.md](./motion-source-security.md).
