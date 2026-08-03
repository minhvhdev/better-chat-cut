# VideoPlanV1

Multi-scene visual planning artifact for Better Chat Cut (Milestone M5A).

## Purpose

`VideoPlanV1` is a pure JSON planning snapshot that pins exact `SceneClipBindingV1` payloads in sequence order. It is **not** a project format. After `video_plan_assemble`, the OpenChatCut project timeline is the source of truth.

## Schema (1.0.0)

- `id` — `^[a-z0-9]+(?:[.-][a-z0-9]+)*$` (e.g. `video-plan.hawking-radiation`)
- `output` — required `width`/`height`/`fps`/`fit` matching the target timeline
- `sceneCanvasPolicy` — `require-match` (default) or `allow-fit`
- `placement` — `append` | `at-frame` with `require-clear` | `ripple`
- `markers` — `none` | `boundary` | `range` | `both`
- `scenes[]` — ordered entries with embedded `SceneClipBindingV1`

## Duration / gaps / transitions

- `match-scene` (default) uses M4B `sceneDurationToTimelineFrames`
- `timeline-frames` truncates or holds last frame (no time-stretch)
- Gaps are empty track ranges (no auto black solid)
- Transitions: `cut` or built-in visual `timeline-transition` types (no audio-cross-fade / custom-shader)

## Hash / revision

- Plan hash: SHA-256 of normalized plan (stable key order)
- Runtime revision: `video-plan-runtime.1.0.0`

## Limits

See named constants in `packages/video-plans` (`MAX_VIDEO_PLAN_SCENES=100`, two-hour frame cap at 30fps, etc.).

## MCP

- `video_plan_get_contract`, `video_plan_validate` (no project)
- Project tools require edit sessions: preview / assemble / inspect / validate_render
