# project-scene-bindings

Portable `SceneClipBindingV1`, timeline item builders, frame mapping, sync plans, readiness checks, and `BetterChatCutTimelineScene` renderer.

Playback uses the embedded scene snapshot. Scene Draft Store is authoring-only.

After M5A, assembled clips may also carry `__betterChatCutVideoPlan` metadata (see `packages/project-video-assembly`).

Verify:

```bash
npm run verify:better-chat-cut-project-scenes
npm run verify:better-chat-cut-project-scenes:render
npm run verify:better-chat-cut-project-scenes:session
```
