# Publishing Security

- Opaque `connectionId` only in persisted artifacts
- Credentials resolved in-memory (env / future plugin store), never written under publishing root
- No tokens via MCP tools/events/receipts/logs
- No arbitrary endpoints, headers, local paths, or source-code upload
- No remote deletion tools
