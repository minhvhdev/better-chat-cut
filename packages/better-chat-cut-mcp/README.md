# @better-chat-cut/better-chat-cut-mcp

Semantic MCP adapter for Cursor: catalog search, asset resolve, scene compose/patch/validate, and contact-sheet/frame render helpers.

## Status

Package folder remains a future home for thicker semantic facades. Through **M3B**, Better Chat Cut MCP tools ship as thin adapters on the existing OpenChatCut server:

- `server/external-agent/better-chat-cut/asset-search.ts` (and related catalog tools)
- `server/external-agent/better-chat-cut/motion-tools.ts`
- `server/external-agent/better-chat-cut/motion-source-tools.ts`
- `server/external-agent/better-chat-cut/scene-tools.ts` (`scene_get_contract`, `scene_validate`, `scene_evaluate_frame`, `scene_render_preview`)
- `server/external-agent/better-chat-cut/asset-resolver-tools.ts` (`asset_resolver_get_contract`, `asset_requirements_validate`, `asset_resolve_batch`, `asset_plan_validate`)
- `server/external-agent/better-chat-cut/scene-draft-tools.ts` (`scene_draft_*` create/compose/patch/undo/redo/preview)
- `server/external-agent/better-chat-cut/scene-binding-tools.ts` / scene clip tools via editor registry
- `server/external-agent/better-chat-cut/video-plan-tools.ts` (`video_plan_get_contract`, `video_plan_validate`; project tools via edit-session registry)
- `server/external-agent/better-chat-cut/narration-tools.ts` (`narration_*`)
- `server/external-agent/better-chat-cut/production-render-tools.ts` (`production_render_*` prepare/submit/status/cancel/list/manifest/validate)
- `server/external-agent/better-chat-cut/production-orchestrator-tools.ts` (`explainer_orchestrator_get_contract`, `production_run_*` create/list/get/validate/put/plan/execute/review/resume/cancel/delivery)
- `server/external-agent/better-chat-cut/publishing-tools.ts` (`publishing_get_contract`, `publishing_connection_inspect`, `publishing_package_validate`, `publishing_run_*` create/list/get/validate/put/plan/execute/review/resume/cancel/release)
- `server/external-agent/better-chat-cut/workspace-tools.ts` (`workspace_get_contract`, `workspace_get_overview`, `workspace_get_run_detail`, `workspace_list_reviews`, `workspace_health_check`, `workspace_plan_migrations`, `workspace_apply_migrations`, `workspace_export_diagnostics`)

Do not stand up a second MCP HTTP server.

## Principles

- MCP is an adapter, not an asset store.
- Do not hard-code assets into the MCP server.
- Prefer wrapping shared libraries and OpenChatCut command tools.
- Upstream OpenChatCut MCP remains at `server/external-agent/mcp.ts`.
