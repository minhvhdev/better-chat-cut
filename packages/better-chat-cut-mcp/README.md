# @better-chat-cut/better-chat-cut-mcp

Semantic MCP adapter for Cursor: catalog search, asset resolve, scene compose/patch/validate, and contact-sheet/frame render helpers.

## Status

Placeholder only. Do not add this package to a workspace build until real sources exist.

## Principles

- MCP is an adapter, not an asset store.
- Do not hard-code assets into the MCP server.
- Prefer wrapping shared libraries and OpenChatCut command tools.
- Upstream OpenChatCut MCP remains at `server/external-agent/mcp.ts`.
