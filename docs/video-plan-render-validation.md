# VideoPlan render validation

## Modes

- `metadata-only` — assembly inspection + scene-clip readiness / export readiness flags
- `sample-frames` — TimelineComposition Remotion stills + contact sheet

## Sample frames

Per scene: first / middle / last. Per transition: cut±half. Plus assembly first/last. Deduped, sorted, capped at `MAX_RENDER_VALIDATION_SAMPLE_FRAMES` with stratified keep.

## Proposal drafts

Validation runs on edit-session proposal state (live project may still be empty before approve).

## Policies

- Fully transparent active-range frame → error
- Mostly black → warning
- Identical adjacent samples when motion/transition expected → warning
- No MCP export job submission; verify scripts may render temporary low-res output and delete it

## MCP output

Structured report without PNG bytes; ImageContent / base64 may accompany tool results for contact sheets.
