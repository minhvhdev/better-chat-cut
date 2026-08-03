# extensions/better-chat-cut

Thin integration surface between Better Chat Cut packages and the OpenChatCut editor core.

## Layout

- `catalog/manifests/` — bundled published asset manifests (primitives, animations, background, label)
- `catalog/previews/` — optional generated PNG stills (`npm run generate:better-chat-cut-previews`)

## MCP adapters

Live under `server/external-agent/better-chat-cut/` and register on the existing OpenChatCut MCP server:

- Catalog: `asset_search`, `asset_get`, validate/create/update/transition tools
- Motion: `motion_asset_inspect`, `motion_asset_validate_props`, `motion_asset_render_preview`
- Motion source (M2B): `motion_source_get_contract`, `motion_asset_source_*`, `motion_asset_prepare_staging`
- Scene (M3A): `scene_get_contract`, `scene_validate`, `scene_evaluate_frame`, `scene_render_preview`
- Asset resolver (M3B): `asset_resolver_get_contract`, `asset_requirements_validate`, `asset_resolve_batch`, `asset_plan_validate`

Remotion preview compositions live in `remotion/better-chat-cut/` (hooked from `remotion/Root.tsx`), including scene still/contact-sheet.

See [docs/architecture.md](../../docs/architecture.md), [docs/scene-graph-v1.md](../../docs/scene-graph-v1.md), [docs/scene-preview.md](../../docs/scene-preview.md).
