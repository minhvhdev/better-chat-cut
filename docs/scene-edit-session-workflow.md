# Scene Edit-Session Workflow

Project-facing scene clip tools run through OpenChatCut edit sessions (same path as built-in agent + external MCP).

## Bind

1. `scene_draft_get_binding_payload`
2. `target_project`
3. `begin_edit_session` (`manual` or `auto`)
4. `scene_clip_bind` (draft only)
5. `review_edit_session`
6. Wait until `get_edit_session` reports `applied`

Do not claim the live timeline changed while status is still `drafting` / `awaiting_review`.

## Sync

1. `scene_clip_get`
2. `scene_draft_get_binding_payload`
3. `begin_edit_session`
4. `scene_clip_compare`
5. `scene_clip_sync`
6. `review_edit_session` → applied

## Multi-scene VideoPlan (M5A)

1. `scene_draft_get_binding_payload` for each scene
2. Build `VideoPlanV1` → `video_plan_validate`
3. `target_project` → `begin_edit_session`
4. `video_plan_preview_assembly` → `video_plan_assemble`
5. `video_plan_inspect_assembly` → `video_plan_validate_render`
6. `review_edit_session` → applied (one undo step for the whole sequence)

## Guarantees

- Manual sessions leave the live project untouched until approval
- Auto sessions apply atomically at review
- Multiple bind/sync/move tools in one session become one undo step
- Stale sessions fail closed (no manual fallback)

## Read-only control tools

`scene_binding_get_contract` and `scene_draft_get_binding_payload` do not require a project or edit session.
