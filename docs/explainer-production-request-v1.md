# ExplainerProductionRequestV1

Purpose: typed production request for the end-to-end explainer orchestrator (M6A).

## Project binding

Baseline mode: `project.mode = "existing-target"` (targeted OpenChatCut project). No parallel project store.

## Output

`output.renderProfile`: `youtube-1080p-h264` | `youtube-1440p-h264` | `youtube-2160p-h264` | `preview-720p-h264`.

## Factual / workflow policy

See defaults in `DEFAULT_EXPLAINER_PRODUCTION_POLICY` (`review-key-stages`, captions+SRT+VTT required, manual project mutation approval).

## Limits

- Max serialized size: 2 MiB
- Duration: 5–7200 seconds
- Request id pattern: `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`

## Non-goals

No automatic web research, no built-in LLM authoring, no publishing.

Full schema lives in `packages/explainer-production-contracts`.
