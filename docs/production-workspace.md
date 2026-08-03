# Production Workspace (M7A)

Typed Production Workspace for Better Chat Cut inside the OpenChatCut app shell.

## Navigation

- Dashboard header → **Production**
- Hash route: `#/production-workspace` (+ subroutes for production/publishing/reviews/health/…)

## Architecture

```
React UI (src/better-chat-cut/production-workspace)
  → same-origin /api/better-chat-cut/workspace/*
    → ProductionWorkspaceService façade
      → production + publishing orchestrators, health, migrations, diagnostics
```

UI and MCP share the service layer. Neither uses MCP transport for in-app control.

## Overview

Counts, recent production/publishing runs, pending reviews, active operations, health summary. Filters/search/sort/pagination via overview query.

## Run detail

Stage timeline (server-computed available actions), next action, artifact lineage, reviews with exact hashes, operations, delivery downloads.

## Commands

Explicit `WorkspaceCommandV1` types only (create/put/execute/review/resume/cancel for production and publishing). Dry-run by default semantics match orchestrators (`dryRun !== false`). Optimistic concurrency via revision + workflow fingerprint.

## Known limitations

No AI generation, multi-platform publish, team accounts, signed installers, auto-updater, backup wizard, or cloud sync (see M7B).
