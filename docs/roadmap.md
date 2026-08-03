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

**M4A complete** when persistent scene drafts, AssetPlan→Scene composition, semantic patching, preview-review-patch, optimistic concurrency, undo/redo, and `scene_draft_*` MCP tools pass verification. M4A does **not** bind drafts to projects/timeline.

**M4B complete** when portable SceneClipBindingV1, motion-graphic timeline clips, edit-session bind/sync, timeline/Remotion preview, and MCP tools pass verification. M4B does **not** assemble multi-scene videos or ship a dedicated scene UI.

**M5A complete** when VideoPlanV1, deterministic schedule, edit-session timeline assembly (append/ripple), transitions/markers, assembly inspection, and TimelineComposition render validation pass verification. M5A does **not** add narration, TTS, voice-over, captions, audio mixing, or production MP4 orchestration.

**Next:** M5B — Narration Plan, Temporary TTS Timing, Voice-over Alignment and Subtitle Tracks

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

## Milestone 4A — Persistent Scene Drafts (done when criteria pass)

* Persistent standalone scene drafts under local Better Chat Cut data
* AssetPlan-to-Scene composition (exact/reuse/variant/composition)
* Semantic scene patching + dry-run + change summary
* Preview-review-patch loop (reuse M3A preview cache)
* Optimistic concurrency, receipts, audit journal, undo/redo

**M4A provides:** persistent drafts, AssetPlan composition, semantic patching, preview-review-patch, concurrency, undo/redo.  
**Not yet:** project persistence integration, timeline clips, editor UI, multi-scene video pipeline.

## Milestone 4B — Project Scene Bindings (done when criteria pass)

* Portable SceneClipBindingV1 with embedded snapshot + binding hash
* Motion-graphic timeline clips (`better-chat-cut.scene-v1`)
* Explicit scene_clip_bind / scene_clip_sync via edit sessions
* Timeline + proposal preview + headless Remotion path
* MCP: scene_binding_*, scene_draft_get_binding_payload, scene_clip_*

**M4B provides:** project-bound scene clips, explicit sync, one undo-step apply.  
**Not yet:** multi-scene VideoPlan, TTS/subtitles, asset packaging, dedicated scene UI.

## Milestone 5A — Multi-scene Video Plan (done when criteria pass)

* VideoPlanV1 + deterministic schedule/hash
* Atomic edit-session assembly (append / at-frame / ripple)
* Built-in visual transitions + boundary/range markers
* Assembly inspection + TimelineComposition render validation
* MCP: `video_plan_*`

**M5A provides:** multi-scene visual assembly on the OpenChatCut timeline.  
**Not yet:** narration, TTS, voice-over, captions/SRT, audio mixing, production MP4 orchestration, publishing.

**Next proposed:** M5B — Narration Plan, Temporary TTS Timing, Voice-over Alignment and Subtitle Tracks

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

M0, M1A, M1B, M2A, M2B, M3A, M3B, M4A, M4B, and M5A are implemented on `main`. Later milestones require separate design approval before implementation. Better Chat Cut is **not** a complete product yet — narration/TTS/subtitles, audio mixing, and full publish pipeline remain.
