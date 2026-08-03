# @better-chat-cut/better-chat-cut-mcp

Semantic MCP adapter for Cursor: catalog search, asset resolve, scene compose/patch/validate, and contact-sheet/frame render helpers.

## Status

Package folder remains a future home for thicker semantic facades. Through **M3A**, Better Chat Cut MCP tools ship as thin adapters on the existing OpenChatCut server:

- `server/external-agent/better-chat-cut/asset-search.ts` (and related catalog tools)
- `server/external-agent/better-chat-cut/motion-tools.ts`
- `server/external-agent/better-chat-cut/motion-source-tools.ts`
- `server/external-agent/better-chat-cut/scene-tools.ts` (`scene_get_contract`, `scene_validate`, `scene_evaluate_frame`, `scene_render_preview`)

Do not stand up a second MCP HTTP server.

## Principles

- MCP is an adapter, not an asset store.
- Do not hard-code assets into the MCP server.
- Prefer wrapping shared libraries and OpenChatCut command tools.
- Upstream OpenChatCut MCP remains at `server/external-agent/mcp.ts`.
