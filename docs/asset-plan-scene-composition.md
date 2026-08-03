# AssetPlan → Scene Composition

M4A maps a validated `AssetPlanV1` plus `AssetPlanSceneCompositionSpecV1` into a `SceneDocumentV1`.

## Pipeline

1. Validate AssetPlan (hash, dependencies, staleness)
2. Validate composition spec / placements
3. Map decisions → scene nodes
4. Normalize + validate via Scene Graph (M3A)
5. Persist compact AssetPlan reference on the draft

## Decision mapping

| Strategy | Output |
|---|---|
| `exact` / `reuse` / `variant` | One `SceneAssetNodeV1` |
| `composition` | Group + child asset nodes |

Creation briefs, duplicate reviews, and unresolved required decisions are blocked.

## Stale plans

- `stale && reusable` → compose allowed with warning
- `stale && !reusable` → blocked
- Invalid plan hash / missing assets / invalid props → blocked

## Layout hints

Deterministic normalized boxes for `overlay`, `row`, `column`, `labelled`.  
`radial` and `custom` require explicit boxes (no auto-layout guessing).

Part node ids default to `<groupNodeId>__<sanitizedPartId>` (no random suffix). Collision fails.

## Recovery

Re-run `asset_resolve_batch` when plan validation fails, or supply missing placements / overrides.
