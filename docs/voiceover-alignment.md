# Voice-over Alignment

Deterministic monotonic token alignment maps NarrationPlan segments onto an operational voice-over transcript.

## Modes

- `transcript` — require non-stale word-level transcript on a media asset or timeline item
- `manual` — exact overrides via word indices **or** milliseconds

## Confidence

- high ≥ 0.85
- medium ≥ 0.70
- low ≥ 0.55 (blocks automatic retime)
- failed < 0.55

Vietnamese accent-insensitive comparison (`đ` → `d`) is supported. No LLM / network / new ASR in M5B.
