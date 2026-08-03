# Research, script, and storyboard contracts

Caller-authored artifacts for M6A:

- **ResearchBriefV1** — sources + factual claims with review status (no network fetch)
- **ExplainerScriptV1** — narration segments with claim lineage
- **StoryboardV1** — ordered scenes with explicit `normalizedBox` placements (no auto-layout)

Transforms:

- Storyboard → `AssetRequirementSetV1`
- Storyboard scene → `AssetPlanSceneCompositionSpecV1`
- Storyboard + bindings → `VideoPlanV1`
- Script + storyboard + VideoPlan + speakers → `NarrationPlanV1`

Rejected claims cannot enter scripts. Source-less facts fail when `requireSources` is true.
