# Scene Graph v1

Pure-data scene documents for Better Chat Cut (Milestone **M3A**).

## Purpose

Represent a single scene as JSON: canvas, timing, theme pin, and a hierarchy of group/asset nodes. Scenes reference motion assets and animations by **exact id + version**. No React, TSX, paths, URLs, or executable expressions.

## Schema version

`schemaVersion: "1.0.0"`

## Scene ID

Pattern: `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`  
Examples: `scene.hawking-intro`, `scene.basic-explainer`

## Canvas / timing limits

| Field | Range |
|---|---|
| width | 320..3840 |
| height | 180..2160 |
| fps | 1..60 |
| durationInFrames | 1..1800 (max 60s @ 30fps) |

Other limits: serialized size ≤ 1 MiB, ≤ 200 nodes, depth ≤ 8, ≤ 16 animations/node, props ≤ 64 KiB/node.

## Node types

- **group** — transform container; no asset props; may contain groups/assets
- **asset** — exact `asset.id` + `asset.version`, optional props, `fit: contain|cover|stretch`

Timing uses half-open intervals `[startFrame, endFrame)`.

## Coordinate system

- Origin: top-left
- X right, Y down
- Root nodes: canvas space
- Children: parent content-box top-left

## Transform order

1. layout translation  
2. anchor translation  
3. animation translation  
4. rotation  
5. scale  
6. reverse anchor translation  

## Animation instances

Exact `animation.id` + `animation.version`. Local frame = `sceneFrame - node.startFrame`. Composition reuses M2A rules: x/y add, rotation add, scale multiply, opacity multiply.

## Normalization & hash

`normalizeSceneDocument` applies defaults without mutating input and sorts nodes deterministically.  
`computeSceneContentHash` is SHA-256 over stable serialization of the normalized scene (no timestamps/paths). Dependency fingerprint is separate.

## Exact version policy

No latest fallback for assets, animations, or themes. Draft assets are rejected. Deprecated exact pins warn. Staging/published verified user runtimes are allowed; draft candidate runtimes are not.

## Example

See `packages/scene-graph/src/fixtures/valid/` (`scene.basic-explainer`, `scene.group-transform`, `scene.nested-group`).

## Migration

M3A is inline/read-only. M4A adds standalone persistent scene drafts (`packages/scene-drafts`) without changing SceneDocumentV1 semantics. Project/timeline binding is M4B.
