# Motion Component Runtime (M2A)

Better Chat Cut registers reusable React/SVG motion assets in a compile-time runtime registry. Catalog manifests remain metadata; only pre-registered implementations can render.

## Flow

```text
Asset Manifest (catalog)
      │
      ▼
Global Asset Registry
      │
      ▼
Motion Runtime Registry  ← themes, animations, components
      │
      ▼
MotionAssetRenderer
      │
      ▼
Remotion Root (BetterChatCutAssetPreview|Still|ContactSheet)
```

## Package

`packages/motion-components/`

- `src/contracts/` — shared types
- `src/runtime/registry.ts` — registration + props validation
- `src/runtime/MotionAssetRenderer.tsx` — Remotion-facing renderer
- `src/components/` — built-in primitives / background / label
- `src/animations/` — fade/slide/pop/float/pulse
- `src/themes/` — `default`, `high-contrast`
- `src/preview/preview-service.ts` — Remotion still + disk cache
- `src/bootstrap.ts` — one-shot registration

## Security boundaries

- No dynamic import of user-supplied component paths
- No remote fetch for implementations
- No arbitrary code execution from manifests
- Preview cache lives under `~/.openchatcut/better-chat-cut/preview-cache`
- MCP responses do not expose absolute cache paths

## Adding a built-in component

1. Implement the React component in `src/components/`
2. Register via `registerMotionComponent` in `registerBuiltInComponents`
3. Add a published catalog manifest under `extensions/better-chat-cut/catalog/manifests/<id>/<version>.asset.json`
4. Run `npm run verify:better-chat-cut-motion` and regenerate previews if desired

## Known limitations (M2A)

- Animation assets are presets, not timeline items
- Full motion catalog (characters, scenes, templates) is out of scope

## M2B extension

User catalog draft assets may supply restricted `index.tsx` source. Builds are immutable under `runtime/<buildHash>/`. Evaluation runs only in Remotion Chromium via `SandboxedUserMotion` (not Node `import()` / `node:vm`). See [motion-source-pipeline.md](./motion-source-pipeline.md).
