# NarrationPlanV1

Better Chat Cut narration plans embed an exact normalized `VideoPlanV1` and map spoken segments to scene entry IDs.

## Highlights

- Schema version `1.0.0`
- Speakers with allowlisted temporary TTS voices (`elevenlabs` | `doubao` | `minimax`)
- Scene duration policies: `fit-narration`, `at-least-visual`, `preserve-video-plan`
- Caption policy reuses OpenChatCut caption templates/pacing
- Deterministic plan hash + `narration-runtime.1.0.0` revision
- No API keys, endpoints, or credentials in the plan

## Package

`packages/narration-plans` — pure TypeScript validation, normalization, hashing, estimated word timing, and timed VideoPlan resolution.
