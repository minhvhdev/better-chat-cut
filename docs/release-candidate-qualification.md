# Release candidate qualification (M7B.1)

Qualification is evidence-backed:

- Required check registry (`CHECK_REGISTRY_REVISION`)
- Immutable `QualificationEvidenceV1` per check
- Profiles: `unit-test`, `internal-development`, `roadmap-closure`, `production-release`
- **No** `forcePassLocalChecks` / required-check overrides on the public API or MCP
- Distribution evidence is loaded from the distribution store and re-hashed (caller metadata alone is rejected)
- Roadmap closure rejects `fake-test`, stub/dry-run artifacts, dirty trees, and incomplete milestone evidence

Scripts:

- `verify:better-chat-cut-release-qualification`
- `verify:better-chat-cut-m7b:e2e`
- `verify:better-chat-cut-full-regression`
- `verify:better-chat-cut-roadmap-closure` (clean tree + current-host real package + full executed checks)
