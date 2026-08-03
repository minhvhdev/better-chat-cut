# Final Export QA

Structural preflight blocks drifted VideoPlan/narration, missing media/runtime, and draft/staging dependencies (staging only with explicit allow).

Post-render QA probes streams, duration/FPS/dimensions, black/freeze/silence ranges, optional loudness (truthfully skipped when LUFS unavailable), subtitle parse/timing, and builds a deterministic contact sheet. Balanced vs strict quality gates decide finalisation.
