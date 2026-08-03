# Semantic Scene Patching

M4A patches scenes with typed semantic operations — not arbitrary JSON Patch.

## Why not JSON Patch

JSON Pointer / merge patches can create illegal graphs, bypass validators, and hide intent. Semantic ops keep hierarchy, assets, props, and animations explicit and auditable.

## Supported operations

Scene: `set_metadata`, `set_canvas`, `set_timing`, `set_theme`, `set_safe_area`  
Nodes: `add_group`, `add_asset`, `remove`, layout/transform/timing/enabled/metadata, `reparent`, `set_order`  
Assets: `replace_asset`, `set_props`, `set_fit`  
Animations: `animation_add`, `animation_update`, `animation_remove`

## Semantics

- Operations apply in array order
- One failure rolls back the whole patch (no partial write)
- Final scene always runs through M3A validation + dependency resolution
- Props/animations use exact versions and M2A validators
- Dry-run default; apply requires revision + content-hash guards
- Patch hash is SHA-256 of stable-serialized semantic content
- Change summary lists added/removed/updated nodes and asset replacements deterministically
