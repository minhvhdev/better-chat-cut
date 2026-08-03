# Motion Preview Harness (M2A)

Preview uses the existing Remotion root. A thin hook in `remotion/Root.tsx` mounts `BetterChatCutCompositions`.

## Compositions

| Id | Purpose |
|---|---|
| `BetterChatCutAssetPreview` | Timed preview of one asset |
| `BetterChatCutAssetStill` | Single-frame still |
| `BetterChatCutAssetContactSheet` | Multi-frame grid still |

Entry: `remotion/better-chat-cut/`

## Input contract

JSON-serializable props:

- `assetId` (required)
- `version`, `props`, `themeId`, `animationId`, `animationProps`
- `mode`: `preview` | `still` | `contact-sheet`
- `frame`, `width`, `height`, `fps`, `durationInFrames`, `background`

Props are validated against the runtime `propsSchema` before render.

## Cache

Disk cache key includes asset id/version, normalized props, theme, animation, frame, size, and `runtimeRevision`. Cache hit returns PNG without re-bundling Remotion when the file exists.

Root: `~/.openchatcut/better-chat-cut/preview-cache`

## MCP tools

| Tool | Behavior |
|---|---|
| `motion_asset_inspect` | Runtime + catalog metadata |
| `motion_asset_validate_props` | Validate/normalize without render |
| `motion_asset_render_preview` | Remotion still or contact-sheet; PNG via MCP `__images` |

Set `BCC_SKIP_MOTION_RENDER=1` to skip Chromium render in CI/fast verify.

## Generate bundled previews

```bash
npm run generate:better-chat-cut-previews
```

Writes PNGs to `extensions/better-chat-cut/catalog/previews/`.

## Example MCP calls

```json
{ "name": "motion_asset_inspect", "arguments": { "assetId": "primitive.arrow" } }
```

```json
{ "name": "motion_asset_validate_props", "arguments": { "assetId": "primitive.circle", "props": { "radius": 50 } } }
```

```json
{
  "name": "motion_asset_render_preview",
  "arguments": {
    "assetId": "primitive.circle",
    "mode": "contact-sheet",
    "animationId": "animation.pop-in"
  }
}
```

## Troubleshooting

- `runtime_missing`: asset id not registered in bootstrap
- Invalid props: fix via `motion_asset_validate_props` errors
- Slow first render: Remotion bundle is cached in-process after first call
- Skip flag left on: unset `BCC_SKIP_MOTION_RENDER`

## Known limitations

- Contact sheet is a single still composed of scaled cells, not a video
- Visual binary hashes may differ slightly across OS/Chromium builds
