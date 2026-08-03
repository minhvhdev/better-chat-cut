# @better-chat-cut/motion-components

Reusable motion runtime for Better Chat Cut.

## Capabilities (M2A)

- Registered React/SVG primitives, backgrounds, UI labels
- Animation presets (fade/slide/pop/float/pulse)
- Themes (`default`, `high-contrast`)
- Props validation
- Remotion preview compositions (`BetterChatCutAssetPreview|Still|ContactSheet`)
- MCP tools: `motion_asset_inspect`, `motion_asset_validate_props`, `motion_asset_render_preview`

## M2B

Composite registry can load **verified** user sandboxed bundles (staging/published). Authoring lives in `packages/motion-authoring-sdk` + `packages/motion-source-pipeline`.

## M3A

`composeMotionAnimationTransforms` is the shared animation composer used by scene frame evaluation. Scenes never register draft candidate bundles into the normal runtime.

## Verify

```bash
npm run verify:better-chat-cut-motion
npm run verify:better-chat-cut-motion-source:render
npm run generate:better-chat-cut-previews
```

Set `BCC_SKIP_MOTION_RENDER=1` to skip Chromium still rendering in verify/generate.

Docs: [motion-runtime.md](../../docs/motion-runtime.md), [motion-preview-harness.md](../../docs/motion-preview-harness.md), [motion-source-pipeline.md](../../docs/motion-source-pipeline.md).

## Notes

- Built-ins register at compile time; verified user runtimes load from catalog descriptors.
- Authored bundles are never `import()`ed in Node — Remotion Chromium evaluates them via `SandboxedUserMotion`.
- Remotion remains the single renderer via a thin hook in `remotion/Root.tsx`.
