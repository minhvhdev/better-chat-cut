# @better-chat-cut/asset-resolver

Deterministic batch Asset Requirement Planner and Asset Resolver for Better Chat Cut.

## Status

M3B implemented. Resolves `AssetRequirementSetV1` into pinned `AssetPlanV1` decisions.

## Capabilities

- Exact pin, reuse, variant (validated props), explicit composition
- Cross-requirement `reuseKey` and greedy `distinctKey`
- Similarity duplicate review before creation briefs
- Deterministic scoring, tie-break, plan hash, resolver revision
- Plan validation with stale-but-reusable catalog detection

## Non-goals

Does **not** create assets, write source, publish, generate SceneDocuments, render previews, or mutate projects/timelines.

## Verify

```bash
npm run verify:better-chat-cut-asset-resolver
```
