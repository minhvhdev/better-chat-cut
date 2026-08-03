# Asset Manifest Schema v1

Source of truth for Better Chat Cut shared assets. Projects reference assets by `id` + `version`; they do not embed generated component source.

## Purpose

- Reuse visual/motion assets across projects and topics.
- Give agents a searchable catalog before creating new assets.
- Keep MCP as a thin adapter over an independent registry.

## Catalog location

Default production root:

```text
extensions/better-chat-cut/catalog/manifests
```

Override with:

```text
BETTER_CHAT_CUT_ASSET_CATALOG_ROOT
```

Test fixtures live under `packages/global-asset-registry/fixtures/` and are never loaded as production assets.

## File naming

Manifest files must end with `.asset.json`.

## Schema version

`schemaVersion` must be `"1.0.0"`. This is the document shape version, not the asset version.

## Required fields

| Field | Notes |
|---|---|
| `schemaVersion` | `"1.0.0"` only in M1A |
| `id` | Stable namespaced id, e.g. `object.earth` |
| `version` | Semver `major.minor.patch` |
| `name` | Display name |
| `description` | Human-readable summary |
| `kind` | Structural kind (not topic) |
| `status` | `draft` \| `staging` \| `published` \| `deprecated` |
| `categories` | Topic taxonomy (many-to-many) |
| `tags` | Free-form slugs |
| `capabilities` | What the asset can do |
| `implementation` | How to load it (`type`, relative `entry`, optional `exportName`) |
| `license` | At least `spdx` |

Optional: `aliases`, `styleTags`, `propsSchema`, `previews`, `provenance`, `deprecation` (required reason when deprecated).

## ID convention

```text
^[a-z0-9]+(?:[.-][a-z0-9]+)*$
```

Examples: `primitive.circle`, `object.earth`, `character.scientist`, `scene-template.process-explanation`.

Never put version or filesystem paths in the id.

## Kind vs category

- `kind` = structural role (`object`, `character`, `background`, ...)
- `category` = topic (`astronomy`, `education`, ...)

## Lifecycle

```text
draft → staging → published
```

`deprecated` stays searchable only when requested.

## Search (M1A)

Deterministic metadata search over id/name/aliases/tags/categories/capabilities/styleTags/description.

- Default statuses: published + staging
- Same-filter values = OR; different filter groups = AND
- Vietnamese aliases match with or without diacritics
- Scoring weights are named constants in `asset-errors.ts`

## MCP

Read-only tool: `asset_search` on the existing OpenChatCut external MCP endpoint.

## Adding an asset

1. Create `*.asset.json` under the catalog root.
2. Validate with `npm run verify:better-chat-cut-assets`.
3. Prefer reuse via `asset_search` before creating duplicates.
