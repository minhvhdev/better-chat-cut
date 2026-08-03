# VideoPlan timeline assembly

## Target

Assembles onto the **active timeline** of an edit-session proposal draft via EditorCore `batch` (one undo step).

## Track resolution

Uses existing video track (default V1) or creates a video track in the same batch when missing.

## Placement

- **append** — `trackEnd(targetTrack)`; ripple collision policy ignored with warning
- **at-frame + require-clear** — fail if range occupied or transitions cross
- **at-frame + ripple** — reverse packed insert + inflate/deflate retime to open gaps using existing ripple semantics

## Clip metadata

Reserved props:

- `__betterChatCutScene` — SceneClipBindingV1
- `__betterChatCutVideoPlan` — assembly id / plan hash / entry id / request hashes

Generic `update_item_props` cannot patch either key.

## Idempotency

Same `requestId` + input hash replays without duplicating clips. Same plan already assembled by another request → `VIDEO_PLAN_ALREADY_ASSEMBLED`.

## Drift

`video_plan_inspect_assembly` detects move/trim/missing transition/marker/duplicate/split. M5A does not auto-repair. `scene_clip_sync` preserves VideoPlan metadata and reports binding drift.

## Limitations

Active timeline only; no VideoPlan persistence store; no auto sync/repair; no audio.
