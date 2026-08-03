# extensions/better-chat-cut

Thin integration surface between Better Chat Cut packages and the OpenChatCut editor core.

## Status

Placeholder only (Milestone 0). No runtime glue yet.

## Intended role

- Register optional Better Chat Cut capabilities with the host app.
- Keep fork-specific wiring out of upstream `src/` whenever possible.
- Expose the fewest possible seams into OpenChatCut command/tool/project layers.

See [docs/architecture.md](../../docs/architecture.md).
