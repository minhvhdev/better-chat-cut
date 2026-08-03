# Asset Resolver

Deterministic batch planner that maps `AssetRequirementSetV1` → `AssetPlanV1`.

## Architecture

1. Validate + normalize requirements (no catalog mutation)
2. Take **one** catalog + motion runtime snapshot
3. Generate candidates (exact, search, preferred IDs) with query-signature reuse
4. Hard-filter (status, kind, capabilities, runtime, props, draft candidates)
5. Score 0..1 with documented weights
6. Plan: exact → reuse groups → distinct greedy → direct/variant/composition → duplicate review → creation brief
7. Emit `AssetPlanV1` with plan hash + resolver revision

## Scoring weights

```
text 0.30 | capability 0.20 | kind 0.10 | category 0.08 | tag 0.08
style 0.07 | props 0.07 | preferredAsset 0.04 | status 0.03 | reuse 0.03
```

## Strategies

| Strategy | Meaning |
| --- | --- |
| exact | Exact id@version pin; no fallback |
| reuse | Existing asset + default/compatible props |
| variant | Same pin + validated non-default props |
| composition | Explicit parts only |
| review-duplicate | Blocked by exact/likely similarity |
| create-new | Creation brief only (no write) |
| none | Skipped optional / unresolved without brief |

## Security / determinism

No LLM, embeddings, internet, randomness, or timestamps in scoring/planning. No catalog/source/scene/timeline writes. No absolute paths or source bundles in outputs.

## MCP tools

- `asset_resolver_get_contract`
- `asset_requirements_validate`
- `asset_resolve_batch`
- `asset_plan_validate`

## Known limitations

- Distinct assignment is greedy, not a full solver
- Composition never inferred from prose
- AssetPlan is not persisted into projects (M4A)
- Does not auto-create drafts
