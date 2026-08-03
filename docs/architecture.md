# Better Chat Cut Architecture

Better Chat Cut is a personal long-term fork of [OpenChatCut](https://github.com/0xsline/OpenChatCut). Upstream continues to provide the editable video editor core. This fork adds an isolated asset-centric layer so agents can research, script, reuse catalog assets, and produce scenes without forking OpenChatCut internals.

## Core hiện có

```text
OpenChatCut
- Editor
- Timeline
- Project model
- Persistence
- Preview
- Remotion rendering
- MCP/agent integration
```

### Baseline map (this repository)

| Concern | Location |
|---|---|
| Editor UI / App shell | `src/App.tsx`, `src/Editor.tsx`, `src/components/` |
| Timeline model & reducers | `src/editor/` |
| Project model & persistence | `src/persist/` (especially `projectStore.ts`) |
| Resource / plugin library | `src/library/`, `src/plugins/`, `server/plugins/extension-store` |
| Preview | `src/components/PreviewPanel.tsx`, Remotion player integration |
| Remotion renderer | `remotion/` (`Root.tsx`, `render.mjs`, `index.ts`) |
| Built-in agent | `src/agent/` |
| External MCP server | `server/external-agent/mcp.ts` (HTTP endpoint via Vite plugin stack) |
| MCP client config sample | `.mcp.json` |
| Server plugins / jobs | `server/plugins/` |
| Desktop shell | `desktop/`, Electron builder config |

OpenChatCut remains responsible for project CRUD, multitrack timeline editing, preview, export/render, and the existing MCP tool surface that edits the live project.

## Phần mở rộng tương lai

```text
Better Chat Cut
- Global Asset Registry
- Asset Resolver
- Reusable vector components
- Animation presets
- Background library
- Character library
- Scene templates
- Semantic MCP tools
- Contact-sheet renderer
- Scene validator
```

### Isolation layout

| Package / area | Purpose |
|---|---|
| `packages/global-asset-registry/` | Shared asset manifests, IDs, versions, lifecycle, deterministic search |
| `packages/asset-resolver/` | Batch AssetRequirementSet → AssetPlan (exact/reuse/variant/composition/duplicate guard) |
| `packages/motion-components/` | Reusable SVG/React motion runtime + Remotion preview helpers (M2A) |
| `packages/motion-authoring-sdk/` | Restricted authoring SDK for agent-written components (M2B) |
| `packages/motion-source-pipeline/` | Source validate/build/candidate preview/prepare-staging (M2B) |
| `packages/scene-graph/` | SceneDocumentV1 schema, frame evaluation, Remotion scene preview (M3A) |
| `packages/scene-templates/` | Scene composition templates (planned) |
| `packages/better-chat-cut-mcp/` | Extra semantic MCP tools beyond thin adapters (planned) |
| `extensions/better-chat-cut/` | Catalog manifests + thin integration glue |
| `server/external-agent/better-chat-cut/` | MCP adapters (`asset_*`, `motion_*`, `scene_*`) |
| `remotion/better-chat-cut/` | Preview compositions hooked into existing `remotion/Root.tsx` |

Further detail: [motion-runtime.md](motion-runtime.md), [motion-preview-harness.md](motion-preview-harness.md), [motion-source-pipeline.md](motion-source-pipeline.md), [scene-graph-v1.md](scene-graph-v1.md), [scene-runtime.md](scene-runtime.md), [scene-preview.md](scene-preview.md), [asset-manifest-v1.md](asset-manifest-v1.md).

## Nguyên tắc tích hợp

* Không hard-code asset vào MCP server.
* MCP chỉ là adapter cho Cursor.
* Component, asset và renderer dùng chung một core library.
* Project chỉ tham chiếu asset bằng ID và version.
* Agent luôn tìm asset trước khi tạo mới.
* Tạo asset mới theo lifecycle:

```text
draft → staging → published
```

* Theme được tách khỏi asset.
* Category và tag là metadata nhiều-nhiều.
* UI và MCP phải sử dụng cùng project model và command layer.
* Phần riêng của Better Chat Cut phải có ít điểm nối nhất có thể với core OpenChatCut.

## Integration seams (keep few)

Preferred seams into OpenChatCut:

1. **Command / tool layer** — call existing editor tools rather than mutating store internals.
2. **Project references** — store Better Chat Cut asset IDs + versions in project metadata or clip payloads without embedding component source.
3. **MCP adapter** — `packages/better-chat-cut-mcp` may wrap or sit beside `server/external-agent`, without hard-coding catalog contents into the OpenChatCut MCP server.
4. **Render helpers** — contact-sheet / frame preview should reuse Remotion paths already used by export/preview.

Avoid:

- Copying asset SVG/React source into each project.
- Duplicating timeline reducers.
- Rewriting upstream MCP tools when a thin semantic facade will do.
- Broad renames of OpenChatCut packages, imports, or Electron app IDs.

## Sync posture

All Better Chat Cut-specific work should live under `extensions/`, `packages/`, `docs/`, and `.cursor/` whenever possible so `git merge upstream/main` stays reviewable. See [upstream-sync.md](upstream-sync.md).
