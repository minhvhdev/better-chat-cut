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
- Scene drafts (M4A): `scene_draft_get_contract`, `scene_draft_list`, `scene_draft_get`, `scene_draft_create`, `scene_draft_compose_asset_plan`, `scene_draft_patch`, `scene_draft_undo`, `scene_draft_redo`, `scene_draft_validate`, `scene_draft_render_preview`
- Production orchestrator (M6A): `explainer_orchestrator_get_contract`, `production_run_create`, `production_run_list`, `production_run_get`, `production_run_validate`, `production_run_put_artifact`, `production_run_plan_next`, `production_run_execute_stage`, `production_run_review`, `production_run_resume`, `production_run_cancel`, `production_run_get_delivery`

Remotion preview compositions live in `remotion/better-chat-cut/` (hooked from `remotion/Root.tsx`), including scene still/contact-sheet.

See [docs/architecture.md](../../docs/architecture.md), [docs/end-to-end-production-workflow.md](../../docs/end-to-end-production-workflow.md), [docs/scene-graph-v1.md](../../docs/scene-graph-v1.md).
