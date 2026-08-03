# Production Render Operations

Persistent operations under `BETTER_CHAT_CUT_DELIVERY_ROOT` (default `~/.openchatcut/better-chat-cut/deliveries`).

Lifecycle: queued → preflight → snapshotting → rendering-video → generating-subtitles → running-qa → finalizing → completed|failed|cancelled.

Idempotent by `requestId` + input hash. Completed bundles are reused when `reuseCompletedBundle` is true. Resume restarts the video phase when frame-level resume is unavailable. Cancellation is supported for in-flight operations.
