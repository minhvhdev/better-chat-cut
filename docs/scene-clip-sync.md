# Scene Clip Sync

Sync is explicit: generate a new binding payload from a scene draft, then call `scene_clip_sync` inside an edit session.

## Why no live sync

Project playback must stay stable if the draft root is unavailable. Proposal previews and exports must not drift when drafts change outside the project.

## Compare statuses

`synced` · `source-newer` · `source-older` · `source-unavailable` · `detached-snapshot` · `binding-invalid` · `dependency-invalid`

## Guards

Expected item fingerprint and binding hash must match. Sync cannot rebind to a different `draftId`.

## Policies

- `timingPolicy=preserve-timeline` (default): keep duration/`srcInFrame`
- `timingPolicy=match-scene`: retarget duration from the new scene
- `namePolicy=preserve` (default) or `match-draft`

Transforms, effects, filters, fades, zoom, track, and start frame are always preserved.

## Undo

Sync applies as one OpenChatCut batch / one project undo step. Scene Draft history is unchanged.
