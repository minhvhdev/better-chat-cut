# @better-chat-cut/motion-components

Reusable motion runtime for Better Chat Cut.

## Capabilities (M2A)

- Registered React/SVG primitives, backgrounds, UI labels
- Animation presets (fade/slide/pop/float/pulse)
- Themes (`default`, `high-contrast`)
- Props validation
- Remotion preview compositions (`BetterChatCutAssetPreview|Still|ContactSheet`)
- MCP tools: `motion_asset_inspect`, `motion_asset_validate_props`, `motion_asset_render_preview`

## Verify

```bash
npm run verify:better-chat-cut-motion
npm run generate:better-chat-cut-previews
```

Set `BCC_SKIP_MOTION_RENDER=1` to skip Chromium still rendering in verify/generate.

Docs: [motion-runtime.md](../../docs/motion-runtime.md), [motion-preview-harness.md](../../docs/motion-preview-harness.md).

## Notes

- Runtime registrations are the only implementations MCP may render.
- User catalog manifests cannot dynamically import arbitrary TSX in M2A.
- Remotion remains the single renderer via a thin hook in `remotion/Root.tsx`.
