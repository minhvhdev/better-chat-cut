# Better Chat Cut Roadmap

This roadmap tracks fork-specific milestones. Upstream OpenChatCut features continue to arrive via `/sync-openchatcut`.

## Milestone 0 — Baseline

* Fork hoạt động.
* Development server chạy.
* Test, lint, type-check và build chạy được.
* Remote `upstream` hoạt động.
* Skill đồng bộ upstream hoạt động.

## Milestone 1 — Asset Registry

* Manifest schema. *(M1A done)*
* Asset ID và version. *(M1A)*
* Category, tag và capability. *(M1A)*
* Preview. *(schema + M2A Remotion harness)*
* Search cơ bản. *(M1A: `asset_search`)*
* Asset lifecycle. *(M1B: draft/update/transition MCP tools)*

## Milestone 2 — Motion Component Catalog

* SVG/React component. *(M2A: primitives, background, label runtime)*
* Design tokens. *(M2A themes)*
* Animation preset. *(M2A fade/slide/pop/float/pulse)*
* Background layer. *(M2A `background.solid`)*
* Scene template. *(later)*
* Preview component. *(M2A Remotion + MCP preview tools)*

**M2A complete** when acceptance criteria pass. Full motion catalog is **not** claimed complete.

**M2B complete** when restricted authoring SDK, source pipeline, Chromium sandbox preview, prepare-staging, and MCP tools pass verification.

**M3A complete** when SceneDocumentV1, scene runtime evaluation, Remotion scene still/contact-sheet, and read-only `scene_*` MCP tools pass verification. M3A is **inline/read-only** only — no scene persistence or timeline integration.

**M3B complete** when batch AssetRequirementSetV1 → AssetPlanV1 resolution (exact/reuse/variant/composition/duplicate guard/creation brief) and read-only `asset_resolve_*` MCP tools pass verification. M3B does **not** create assets, persist AssetPlans, or generate SceneDocuments.

**Next:** M4A — Persistent Scene Drafts, AssetPlan-to-Scene Composition and Semantic Scene Patching

## Milestone 3 — Asset Resolver

* Batch requirements. *(M3B done)*
* Reuse. *(M3B)*
* Variant. *(M3B)*
* Composition. *(M3B explicit parts only)*
* Similarity check. *(M3B)*
* Chống tạo asset trùng. *(M3B review-duplicate + creation brief)*

Resolver does **not** auto-create assets. AssetPlan is **not** stored in projects yet.

## Milestone 3A — Scene Graph (done when criteria pass)

* SceneDocumentV1 schema + validation
* Scene runtime / world transforms
* Remotion scene preview
* MCP `scene_get_contract`, `scene_validate`, `scene_evaluate_frame`, `scene_render_preview`

## Milestone 3B — Batch Asset Resolver (done when criteria pass)

* AssetRequirementSetV1 + validation/hash
* Deterministic candidate scoring + strategies
* AssetPlanV1 + plan validation/staleness
* MCP `asset_resolver_get_contract`, `asset_requirements_validate`, `asset_resolve_batch`, `asset_plan_validate`

## Milestone 4 — MCP Scene Tools

* Catalog search.
* Resolve asset. *(M3B batch resolver)*
* Compose scene. *(M4A)*
* Patch scene. *(M4A)*
* Validate scene. *(basic validate in M3A)*
* Render frame. *(M3A still)*
* Render contact sheet. *(M3A)*

## Milestone 4A — Persistent Scene Drafts (planned)

* Scene draft store
* Scene create/get/update
* AssetPlan-to-Scene conversion
* Semantic scene operations / patch validation
* Preview-review-patch loop
* Optimistic concurrency + undoable drafts

## Milestone 5 — Video Pipeline

* Research.
* Script.
* Storyboard.
* AssetPlan.
* Scene generation.
* Preview-review-patch loop.
* Render MP4.
* Export SRT/VTT.
* Timing bằng TTS tạm.
* Căn lại theo voice-over thật.

## Status

M0, M1A, M1B, M2A, M2B, M3A, and M3B are implemented on `main`. Later milestones require separate design approval before implementation. Better Chat Cut is **not** a complete product yet — scene persistence, timeline integration, and multi-scene video pipeline remain.
