# Scene Preview

Remotion still/contact-sheet preview for inline scenes (M3A).

## Compositions

Registered on the existing Remotion root:

- `BetterChatCutSceneStill`
- `BetterChatCutSceneContactSheet`

## Still

Validates scene, resolves dependencies, renders exact frame as PNG. Default output = canvas size; optional scaled preview keeps aspect ratio (320..1920 × 180..1080).

## Contact sheet

Default frames: 0%, 20%, 40%, 60%, 80%, last. Uses the same `SceneRuntimeRenderer`.

## Cache

`~/.openchatcut/better-chat-cut/scene-preview-cache`  
Key: scene content hash, dependency fingerprint, scene/motion runtime revisions, mode, frames, dimensions, label mode, preview renderer version. Atomic write; corrupt PNG re-renders. Absolute paths are not exposed via MCP.

## MCP tools

| Tool | Purpose |
|---|---|
| `scene_get_contract` | Schema, limits, example |
| `scene_validate` | Validate + optional layout analysis |
| `scene_evaluate_frame` | Matrices/bounds (no PNG) |
| `scene_render_preview` | Still or contact-sheet ImageContent |

All read-only; no edit session/project required; no timeline mutation.

## Cursor workflow

1. `scene_get_contract`  
2. Draft inline JSON  
3. `scene_validate`  
4. `scene_evaluate_frame` at key frames  
5. `scene_render_preview` still + contact-sheet  

## Known limitations

Candidate draft runtimes rejected. No scene file write. No project/timeline integration. Pixel-perfect collision not claimed (AABB only).
