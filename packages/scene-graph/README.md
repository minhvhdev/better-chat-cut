# @better-chat-cut/scene-graph

Deterministic Scene Graph schema, runtime evaluation, and Remotion preview for Better Chat Cut (Milestone M3A).

## Capabilities

- `SceneDocumentV1` pure-data schema (group + asset nodes)
- Normalization, content hash, dependency resolution, graph validation
- Frame evaluation (world matrices, opacity, bounds, visibility)
- `SceneRuntimeRenderer` composing Composite Motion Runtime assets
- Remotion still + contact-sheet compositions
- MCP tools: `scene_get_contract`, `scene_validate`, `scene_evaluate_frame`, `scene_render_preview`

## Non-goals (M3A)

- No project/timeline persistence
- No semantic scene patch
- No draft candidate runtimes in normal scene rendering
- No auto asset resolution

## Verify

```bash
npm run verify:better-chat-cut-scenes
npm run verify:better-chat-cut-scenes:render
```

Docs: [scene-graph-v1.md](../../docs/scene-graph-v1.md), [scene-runtime.md](../../docs/scene-runtime.md), [scene-preview.md](../../docs/scene-preview.md).
