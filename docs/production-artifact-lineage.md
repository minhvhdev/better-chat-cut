# Production artifact lineage

Each stored artifact is a `ProductionArtifactEnvelopeV1` with type, hash, inputs, producer stage, content.

Active references live in `run.artifacts`. Downstream invalidation updates active refs without deleting historical immutable files.

Fact-to-delivery chain: source → claim → script segment → storyboard scene → asset requirement → AssetPlan → scene draft → VideoPlan → narration → render plan → delivery manifest.
