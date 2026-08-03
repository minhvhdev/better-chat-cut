# Temporary TTS Timing

M5B temporary TTS preparation uses existing voice providers behind an allowlisted adapter.

## Flow

1. `narration_tts_prepare` (`dryRun=true` by default)
2. Cache lookup by `synthesisInputHash`
3. Apply submits missing segments (concurrency ≤ 3)
4. Artifacts store duration, `audioContentHash`, word timing quality
5. `narration_timing_resolve` builds `NarrationTimingSnapshotV1` + timed VideoPlan

Artifacts live under `BETTER_CHAT_CUT_NARRATION_ROOT` (default `~/.openchatcut/better-chat-cut/narration`). Audio bytes stay in media/WAV sidecars; metadata receipts never store credentials.

Default unit tests inject a fake provider and do not call external APIs.
