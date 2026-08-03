# production-workspace-services

Facade service for Better Chat Cut Production Workspace (M7A). Composes existing production and publishing orchestrators into typed overview/detail/review/command APIs, plus health checks, safe migrations, and redacted diagnostic export.

## Architecture

```
UI / MCP / HTTP
      │
      ▼
ProductionWorkspaceService
      ├── ProductionOrchestrator
      ├── PublishingOrchestrator
      ├── Health services
      ├── Migration runner
      └── Diagnostic export
```

Does **not** own run state. Does **not** expose credentials or absolute paths.

## Verification

```bash
npm run verify:better-chat-cut-workspace-services
npm run verify:better-chat-cut-workspace-health
npm run verify:better-chat-cut-workspace-migrations
npm run verify:better-chat-cut-workspace:e2e
```
