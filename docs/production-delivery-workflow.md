# Production Delivery Workflow

1. Finish visuals + narration on the live project.
2. `production_render_prepare` — review preflight.
3. `production_render_submit` with a stable `requestId`.
4. Poll `production_render_status`.
5. `production_render_validate_bundle` / `production_render_get_manifest`.
6. Download artifacts via same-origin URLs.

Does not mutate the project and does not publish/upload.

To publish a completed delivery, use M6B `publishing_run_*` (opaque YouTube connection, private upload, release review). See publishing-run-v1.md.
