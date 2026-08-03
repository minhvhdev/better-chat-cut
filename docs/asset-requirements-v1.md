# Asset Requirements v1

Pure-data batch visual requirements for Better Chat Cut Asset Resolver (M3B).

## Purpose

Agents submit storyboard visual needs as `AssetRequirementSetV1`. The resolver returns an `AssetPlanV1` with exact asset pins — without creating assets or scenes.

## Schema version

`schemaVersion: "1.0.0"`

## Requirement set

```ts
type AssetRequirementSetV1 = {
  schemaVersion: "1.0.0";
  id: string; // ^[a-z0-9]+(?:[.-][a-z0-9]+)*$
  name?: string;
  description?: string;
  theme?: { id: string; version: string };
  defaultPolicy?: Partial<AssetResolutionPolicyV1>;
  requirements: AssetRequirementV1[];
};
```

## Requirement

Key fields: `id`, `name`, `description`, `search.queries`, optional `exactAsset`, `desiredProps`, `reuseKey`, `distinctKey`, `composition`, `policy`.

- Query order is semantic priority (first query weighs more); preserved in requirement hash.
- Metadata arrays (`tags`, `categories`, …) are normalized (slug, dedupe, sort) for hashing.
- Mode: `direct` | `direct-or-composition` | `composition`.
- Composition depth is **1** in M3B; parts cannot nest compositions.

## Limits

| Limit | Value |
| --- | --- |
| Serialized set | 1 MiB |
| Requirements | 100 |
| Composition parts | 12 |
| Queries / requirement | 10 |
| Query length | 256 |
| Metadata values / field | 64 |
| Candidates / requirement (output) | 20 |

## Policies

Defaults prefer `published`, `requireRuntime=true`, variant/composition/creation briefs enabled. Draft is never selectable. Deprecated only via exact pin + `allowDeprecatedExactPin`.

## Examples

See `packages/asset-resolver/src/fixtures/valid/` and MCP `asset_resolver_get_contract`.

## Migration

Unknown fields fail validation. Future schema versions require an explicit bump.
