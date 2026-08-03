# Production stage state machine

Stages: intake → research → script → storyboard → asset-requirements → asset-resolution → (asset-authoring?) → scene-composition → scene-review → video-plan → timeline-assembly → narration-plan → narration-timing → narration-application → timeline-review → production-preflight → production-render → delivery-validation → delivery-review → completion.

Statuses: pending, ready, running, awaiting-input, awaiting-review, awaiting-project-session, awaiting-external-operation, blocked, completed, failed, skipped, cancelled.

Project mutations use edit sessions (`awaiting-project-session`). TTS/render use `awaiting-external-operation` + `production_run_resume`.

Auto mode never bypasses failed QA, duplicate review, source-less facts, or low-confidence voice-over guards.
