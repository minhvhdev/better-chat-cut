# Scene Timeline Clips

Scene drafts become OpenChatCut `TimelineItem` values with `kind: "motion-graphic"` and `templateId: "better-chat-cut.scene-v1"`.

## Duration and FPS

Initial `durationInFrames = ceil(sceneDurationInFrames / sceneFps * timelineFps)` (minimum 1). Scene timing is not rewritten when binding.

## Frame mapping

```
sceneFrame = clamp(floor((srcInFrame + itemLocalFrame) * sceneFps / timelineFps), 0, sceneDurationInFrames - 1)
```

Existing OpenChatCut split updates `srcInFrame` for motion graphics; Better Chat Cut reuses that continuity.

## Clip operations

Move, track change, trim, ripple placement, transforms, keyframes, filters, effects, duplicate, split, remove, and project undo/redo use existing OpenChatCut commands/reducers.

## Preview / export

`TimelineComposition` routes BCC clips to `BetterChatCutTimelineScene`, which renders the embedded snapshot through `SceneRuntimeRenderer`. Invalid bindings show an error card; export readiness fails closed.

## Limitations

- Active timeline only for bind
- No dedicated scene inspector editor
- No auto-sync
- Cross-machine user-runtime packaging is later
