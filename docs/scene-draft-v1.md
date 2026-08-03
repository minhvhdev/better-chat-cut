# Scene Draft v1

Persistent standalone scene drafts for Better Chat Cut (M4A).

## Purpose

Turn an inline `SceneDocumentV1` into a durable authoring artifact that Cursor can create, list, get, patch, preview, undo, and redo — without writing OpenChatCut projects or timeline clips.

## Record

`SceneDraftRecordV1` stores metadata and history pointers:

- `revision` — monotonic integer starting at 1 (increments on patch/undo/redo/metadata writes)
- `sceneContentHash` — hash of the current scene snapshot
- `historyCursor` / `historyEntryIds` — active history list
- optional compact `sourceAssetPlan` binding snapshot

## History

- Immutable snapshots under `revisions/<entryId>.scene.json`
- `entryId` is deterministic from scene hash + operation input hash + previous entry id
- Undo/redo move the cursor only (no new snapshots)
- Patch after undo truncates the redo branch from active history (orphan files may remain)
- Max active history: 200 (hard error when exceeded; no silent compaction)

## Limits

- Semantic patches only (no JSON Patch / JSON Pointer)
- Dry-run default for all write tools
- Optimistic concurrency via `expectedRevision` + `expectedSceneContentHash`

## Migration policy

Schema version is `1.0.0`. Future versions must keep readable history snapshots or ship an explicit migrator. M4A does not migrate OpenChatCut projects.

## Not in M4A

Project bindings, timeline clips, EditorCore commands, draft deletion, and history compaction are deferred to M4B+.
