# End-to-end production workflow

1. Target an existing project.
2. `production_run_create` (dryRun then apply).
3. Put + review research, script, storyboard.
4. Execute asset requirements/resolution; author missing assets (M2B); resume.
5. Scene composition + review (+ semantic patch if needed).
6. VideoPlan → timeline assembly via edit session → resume when applied.
7. Narration plan (speakers) → TTS timing → narration apply edit session.
8. Timeline review → production preflight → render → delivery validation → delivery review → completion.

MCP tools: `explainer_orchestrator_get_contract`, `production_run_*` (12 tools total).

Publishing (M6B) continues from a completed delivery via separate `publishing_*` tools and a publishing run root (`BETTER_CHAT_CUT_PUBLISHING_ROOT`) — see publishing-request-v1.md and youtube-upload-workflow.md.
