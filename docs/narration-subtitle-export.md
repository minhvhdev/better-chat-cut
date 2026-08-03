# Narration Subtitle Export

`narration_export_subtitles` builds cues from timing-snapshot caption words and serializes:

- **SRT** — `HH:MM:SS,mmm`, LF, final newline
- **WebVTT** — `WEBVTT` header, `HH:MM:SS.mmm`

Time origins:

- `timeline` (default) — project frame zero
- `narration-assembly` — relative to narration assembly start

Artifacts store under the narration root `subtitle-artifacts/` tree without exposing absolute paths in MCP results when text is returned inline.
