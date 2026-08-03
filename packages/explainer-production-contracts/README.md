# Explainer production contracts

Pure TypeScript contracts for Better Chat Cut M6A:

- `ExplainerProductionRequestV1`
- `ResearchBriefV1` / sources / factual claims
- `ExplainerScriptV1`
- `StoryboardV1` with explicit placements
- Deterministic transforms to AssetRequirementSet, scene composition specs, VideoPlan, NarrationPlan

No filesystem, MCP, React, or Remotion dependencies (except type-only imports from sibling packages for transform outputs).

Docs:

- [explainer-production-request-v1.md](../../docs/explainer-production-request-v1.md)
- [research-script-storyboard-contracts.md](../../docs/research-script-storyboard-contracts.md)

Verify:

```bash
npm run verify:better-chat-cut-production-contracts
```
