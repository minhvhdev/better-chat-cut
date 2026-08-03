# Scene Runtime

Runtime architecture for evaluating and rendering SceneDocumentV1 (M3A).

## Architecture

```text
SceneDocumentV1
 → normalize + validate
 → dependency resolve (catalog + composite motion runtime + theme)
 → frame evaluate (hierarchy, matrices, opacity, bounds)
 → SceneRuntimeRenderer (Remotion)
```

## Dependency resolution

Exact asset/animation/theme versions. Missing manifest/runtime → error. Draft → error. Deprecated exact → warning. User staging/published verified bundles load via M2B composite registry. Candidate draft bundles never enter normal scene runtime.

## Frame evaluation

- Frame integer in `0..durationInFrames-1`
- Active: enabled + in node interval + all ancestors active
- Visible: active + worldOpacity > 0 + finite scale
- World matrix: parent × local (layout + transform + animations)
- World opacity: parent × base × animation
- World bounds: AABB of transformed local box

## Fit modes

`contain` / `cover` / `stretch` using intrinsic preview size from the motion runtime definition.

## Runtime revision

Deterministic hash of schema/renderer/transform/animation/fit contract versions + capabilities + limits. Included in preview metadata and cache keys.

## Determinism & security

No `Math.random`, clocks, timers, `eval`, or DOM measurement in runtime/geometry/preview semantics. Scenes cannot carry executable content, paths, URLs, or dynamic imports. Props go through M2A validators.

## Known limitations

- Inline scenes only (no persistence)
- Approximate AABB overlap analysis
- No clipping/mask groups, camera, audio, or multi-scene video
