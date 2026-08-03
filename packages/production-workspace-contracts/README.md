# production-workspace-contracts

Typed view models, queries, commands, health/migration/diagnostic contracts, and pure selectors for the Better Chat Cut Production Workspace (M7A).

## Scope

- `WorkspaceOverviewV1`, run summaries/details, stage/artifact/lineage views
- Unified review queue items and operation views
- Explicit `WorkspaceCommandV1` union (maps to production/publishing orchestrator inputs)
- Health reports, migration plans, redacted diagnostic bundles
- Pure selectors that convert production/publishing runs into workspace view models

No I/O, no HTTP, no React. UI and MCP both consume these contracts.

## Verification

```bash
npm run verify:better-chat-cut-workspace-contracts
```
