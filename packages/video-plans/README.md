# packages/video-plans

Pure VideoPlanV1 schema, normalization, hashing, and deterministic scheduling.

- No editor / MCP / Remotion dependencies in the planning core (bindings validated via `project-scene-bindings`).
- Duration conversion reuses `sceneDurationToTimelineFrames` from M4B.
- See `docs/video-plan-v1.md` and `docs/video-plan-scheduling.md`.
