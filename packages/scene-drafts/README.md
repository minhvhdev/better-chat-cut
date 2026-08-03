# @better-chat-cut/scene-drafts

Persistent scene drafts, AssetPlan→Scene composition, and semantic scene patching (M4A).

## Public API

Import from `packages/scene-drafts/src/index.ts`:

- `createSceneDraftService`
- `composeSceneFromAssetPlan`
- `applyScenePatch` / `computeScenePatchHash`
- contracts for drafts, patches, and composition specs

## Verify

```bash
npm run verify:better-chat-cut-scene-drafts
npm run verify:better-chat-cut-scene-drafts:render
```

## Docs

- [scene-draft-v1.md](../../docs/scene-draft-v1.md)
- [asset-plan-scene-composition.md](../../docs/asset-plan-scene-composition.md)
- [semantic-scene-patching.md](../../docs/semantic-scene-patching.md)
- [scene-draft-persistence.md](../../docs/scene-draft-persistence.md)

M4B binds drafts into OpenChatCut projects as motion-graphic scene clips via `packages/project-scene-bindings` (see docs/project-scene-binding-v1.md).
