# Better Chat Cut Roadmap

This roadmap tracks fork-specific milestones. Upstream OpenChatCut features continue to arrive via `/sync-openchatcut`.

## Milestone 0 — Baseline

* Fork hoạt động.
* Development server chạy.
* Test, lint, type-check và build chạy được.
* Remote `upstream` hoạt động.
* Skill đồng bộ upstream hoạt động.

## Milestone 1 — Asset Registry

* Manifest schema. *(M1A done: `docs/asset-manifest-v1.md` + `packages/global-asset-registry`)*
* Asset ID và version.
* Category, tag và capability.
* Preview. *(schema field only in M1A)*
* Search cơ bản. *(M1A: deterministic metadata search + MCP `asset_search`)*
* Asset lifecycle. *(statuses modeled; promotion commands are M1B)*

## Milestone 2 — Motion Component Catalog

* SVG/React component.
* Design tokens.
* Animation preset.
* Background layer.
* Scene template.
* Preview component.

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

Milestone 0 is the setup target for the current repository initialization. Later milestones must not be implemented until their design is approved and planned separately.
