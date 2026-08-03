# Scene Draft Persistence

## Root

- Env override: `BETTER_CHAT_CUT_SCENE_DRAFT_ROOT`
- Default: `~/.openchatcut/better-chat-cut/scene-drafts`
- Independent of cwd for the default path; never writes into the source checkout

## Layout

```
<root>/<draftId>/
  draft.json
  revisions/<entryId>.scene.json
  operations/<requestId>.json
  events.jsonl
  draft.lock
```

## Writes

1. Acquire per-draft exclusive lock (`wx`, finite timeout)
2. Reload record
3. Re-check revision/hash
4. Write immutable snapshot (when needed)
5. Write receipt
6. Append journal event
7. Atomic replace `draft.json`
8. Release lock

If metadata update fails after a snapshot write, the snapshot is an orphan derived record; the previous draft remains readable and the operation is not reported successful.

## Security

- Clients never pass filesystem paths
- Draft/request ids are validated against traversal
- Symlink escape outside the draft root is rejected
- Receipts/journal never store full scenes, source, bundles, or secrets
