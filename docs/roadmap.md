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

**Next:** M2B — Agent-authored Motion Asset Source Pipeline (isolated user workspace, source creation, compile/register path).

## Milestone 3 — Asset Resolver

* Batch requirements.
* Reuse.
* Variant.
* Composition.
* Similarity check.
* Chống tạo asset trùng.

## Milestone 4 — MCP Scene Tools

* Catalog search.
* Resolve asset.
* Compose scene.
* Patch scene.
* Validate scene.
* Render frame.
* Render contact sheet.

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

M0, M1A, M1B, and M2A are implemented on `main`. Later milestones require separate design approval before implementation.
