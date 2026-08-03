# Production run recovery

- **Process restart:** reload run from disk; `production_run_resume` polls TTS / render / edit session once.
- **Failed stages:** respect `maximumStageRetries` for infrastructure failures only.
- **Downstream invalidation:** replacing research/script/storyboard/assets invalidates later stages without deleting history.
- **Cancellation:** stops future stages, keeps artifacts and applied edit sessions, attempts render cancel.

Troubleshooting: `production_run_validate`, inspect `events.jsonl` statuses, re-get revision/fingerprint before mutate.
