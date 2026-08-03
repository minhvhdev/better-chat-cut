# AssetPlan v1

Pinned resolution output from the Asset Resolver.

## Purpose

Carry exact asset id/version/contentHash/(optional)implementationFingerprint selections, composition recipes, duplicate reviews, and creation briefs for later scene composition (M4A).

## Schema

`schemaVersion: "1.0.0"`

Includes: `requirementSetHash`, `planHash`, `catalogRevision`, `motionRuntimeRevision`, `resolverRevision`, `complete`, `decisions[]`, `summary`, `diagnostics`.

## Validation / staleness

`asset_plan_validate` / `validatePlan`:

- Catalog revision change with stable dependencies → `valid=true`, `stale=true`, `reusable=true`
- Dependency content/runtime/props break → invalid, not reusable
- Resolver revision change → stale; recommend re-resolve

## Non-goals

Plans are not stored in OpenChatCut projects in M3B. M4A can compose a SceneDocument from a plan into a standalone scene draft; plans themselves are still not project fields.
