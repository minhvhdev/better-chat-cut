# Explainer production runs

Persistent, resumable, reviewable production orchestrator for Better Chat Cut (M6A).

- Production run root: `BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT` (default `~/.openchatcut/better-chat-cut/production-runs`)
- Stage state machine, artifact lineage, receipts, event journal, optimistic concurrency
- Calls public TypeScript service adapters (not MCP-to-MCP)
- Review checkpoints for artifacts; project mutations go through edit sessions

Docs:

- [production-run-v1.md](../../docs/production-run-v1.md)
- [production-stage-state-machine.md](../../docs/production-stage-state-machine.md)
- [end-to-end-production-workflow.md](../../docs/end-to-end-production-workflow.md)
- [production-run-recovery.md](../../docs/production-run-recovery.md)

Verify:

```bash
npm run verify:better-chat-cut-production-runs
npm run verify:better-chat-cut-production-orchestrator:e2e
```
