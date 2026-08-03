# ProductionRunV1

Persistent production run under `BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT`.

Layout:

```
<run-root>/<run-id>/
  run.json
  artifacts/<type>/<hash>.json
  operations/<request-id>.json
  reviews/<review-id>.json
  events.jsonl
  run.lock
```

- Monotonic `revision` + `workflowFingerprint` for optimistic concurrency
- Immutable artifact envelopes + lineage inputs
- Receipts for idempotent mutations
- Append-only event journal

Run IDs: `production-run.<request-tail>.<request-hash8>`.
