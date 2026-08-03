# Project Scene Binding V1

Better Chat Cut scene drafts bind into OpenChatCut projects as ordinary `motion-graphic` timeline clips.

## Embedded snapshot model

Playback authority is the embedded `SceneDocumentV1` inside `SceneClipBindingV1`. Timeline preview, proposal preview, project reload, import, undo/redo, and Remotion export do **not** read the Scene Draft Store.

## Source draft reference

`sourceDraft` records `draftId`, `draftRevision`, `historyEntryId`, and `sceneContentHash` so agents can compare and sync explicitly. There is no live file watcher.

## Reserved identity

- Template ID: `better-chat-cut.scene-v1`
- Props key: `__betterChatCutScene`
- Binding schema: `1.0.0`

## Binding hash

`bindingPayloadHash` is SHA-256 over a stable JSON serialization of the payload without the hash field. Dependency arrays are sorted deterministically. Validators recompute the hash.

## Dependency snapshot

Exact asset id/version/content hash, animation versions, theme version, and runtime revisions are pinned. Draft candidate runtimes are rejected.

## Project schema

M4B does **not** change `ProjectDoc` schema or bump `CURRENT_PROJECT_VERSION`. Generic motion-graphic `props` persistence already stores the reserved binding object.

## Security

No absolute paths, authored TSX, runtime bundles, secrets, network fetches, dynamic imports, or direct ProjectDoc mutation from MCP.
