import assert from 'node:assert/strict';
import {
  BASIC_EXPLAINER_SCENE,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  normalizeSceneDocument,
} from '../../../packages/scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';
import {
  BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
  computeSceneClipItemFingerprint,
  isBetterChatCutSceneClip,
  planSceneClipBind,
  planSceneClipSync,
  withBindingPayloadHash,
  type SceneClipBindingV1,
} from '../../../packages/project-scene-bindings/src/index.ts';
import { makeDraft, projectReduce, type AnyAction } from '../../../src/editor/store.ts';
import type { ProjectDoc, TimelineItem } from '../../../src/editor/types.ts';
import { emptyProjectDoc } from '../../../src/agent/tools/project-tools.ts';

ensureBetterChatCutMotionRuntime();

function sampleBinding(): SceneClipBindingV1 {
  const normalized = normalizeSceneDocument(structuredClone(BASIC_EXPLAINER_SCENE));
  assert.equal(normalized.success, true);
  if (!normalized.success) throw new Error('normalize failed');
  const scene = normalized.scene;
  const sceneContentHash = computeSceneContentHash(scene);
  return withBindingPayloadHash({
    schemaVersion: '1.0.0',
    bindingMode: 'embedded-snapshot',
    sourceDraft: {
      draftId: 'draft.session-test',
      draftRevision: 2,
      historyEntryId: 'hist_session',
      sceneContentHash,
    },
    scene,
    sceneContentHash,
    dependencyFingerprint: 'dep-fp-session',
    catalogRevision: 'catalog-session',
    motionRuntimeRevision: 'motion-session',
    sceneRuntimeRevision: computeSceneRuntimeRevision(),
    dependencies: {
      assets: [
        { id: 'primitive.circle', version: '1.0.0', contentHash: 'c1', status: 'published' },
        { id: 'background.solid', version: '1.0.0', contentHash: 'b1', status: 'published' },
        { id: 'ui.label', version: '1.0.0', contentHash: 'l1', status: 'published' },
        { id: 'primitive.arrow', version: '1.0.0', contentHash: 'a1', status: 'published' },
      ],
      animations: [
        { id: 'animation.pop-in', version: '1.0.0' },
        { id: 'animation.slide-in', version: '1.0.0' },
        { id: 'animation.fade-in', version: '1.0.0' },
      ],
      theme: { id: 'default', version: '1.0.0' },
    },
  });
}

function emptyDoc(): ProjectDoc {
  return emptyProjectDoc({ fps: 30, width: 1920, height: 1080 });
}

// Manual draft isolation: bind on draft only
{
  const live = emptyDoc();
  const draft = makeDraft(live);
  const binding = sampleBinding();
  const plan = planSceneClipBind({
    bind: { requestId: 'bind-1', binding },
    itemId: 'item_scene_1',
    trackId: 'track_v1',
    needsCreateTrack: false,
    projectFps: 30,
    resolvedStartFrame: 0,
    existingItems: draft.getState().items,
  });
  assert.equal(plan.replayed, false);
  draft.commands.batch(plan.actions as never, 'Add Better Chat Cut scene clip');
  const draftItem = draft.getState().items.find((item) => item.id === 'item_scene_1');
  assert.ok(draftItem);
  assert.ok(isBetterChatCutSceneClip(draftItem));
  assert.equal(live.timelines[0]!.items.length, 0, 'live project unchanged before apply');

  const actions = draft.takeActions();
  assert.ok(actions.length >= 1);
  const applied = actions.reduce((doc, action) => projectReduce(doc, action as AnyAction), live);
  assert.equal(applied.timelines[0]!.items.length, 1);
  assert.equal(applied.timelines[0]!.items[0]!.templateId, BETTER_CHAT_CUT_SCENE_TEMPLATE_ID);

  // One undo step via reverse history semantics: replaying from original restores empty
  assert.equal(live.timelines[0]!.items.length, 0);
}

// Idempotent bind replay
{
  const live = emptyDoc();
  const draft = makeDraft(live);
  const binding = sampleBinding();
  const first = planSceneClipBind({
    bind: { requestId: 'bind-2', binding, startFrame: 12 },
    itemId: 'item_scene_2',
    trackId: 'track_v1',
    needsCreateTrack: false,
    projectFps: 30,
    resolvedStartFrame: 12,
    existingItems: [],
  });
  draft.commands.batch(first.actions as never, 'Add Better Chat Cut scene clip');
  const second = planSceneClipBind({
    bind: { requestId: 'bind-2', binding, startFrame: 12 },
    itemId: 'item_scene_other',
    trackId: 'track_v1',
    needsCreateTrack: false,
    projectFps: 30,
    resolvedStartFrame: 12,
    existingItems: draft.getState().items,
  });
  assert.equal(second.replayed, true);
  assert.equal(second.item.id, 'item_scene_2');
  assert.equal(draft.getState().items.filter((item) => isBetterChatCutSceneClip(item)).length, 1);
}

// Sync preserve-timeline + atomic patchItem
{
  const binding = sampleBinding();
  const live = emptyDoc();
  const draft = makeDraft(live);
  const bindPlan = planSceneClipBind({
    bind: { requestId: 'bind-3', binding },
    itemId: 'item_scene_3',
    trackId: 'track_v1',
    needsCreateTrack: false,
    projectFps: 30,
    resolvedStartFrame: 5,
    existingItems: [],
  });
  draft.commands.batch(bindPlan.actions as never, 'Add Better Chat Cut scene clip');
  const item = draft.getState().items[0]! as TimelineItem;
  const nextScene = structuredClone(binding.scene);
  nextScene.nodes = nextScene.nodes.map((node) =>
    node.id === 'label' && node.type === 'asset'
      ? { ...node, asset: { ...node.asset, props: { ...node.asset.props, text: 'Updated label' } } }
      : node);
  const nextNormalized = normalizeSceneDocument(nextScene);
  assert.equal(nextNormalized.success, true);
  if (!nextNormalized.success) throw new Error('normalize failed');
  const nextHash = computeSceneContentHash(nextNormalized.scene);
  const nextBinding = withBindingPayloadHash({
    ...binding,
    scene: nextNormalized.scene,
    sceneContentHash: nextHash,
    sourceDraft: { ...binding.sourceDraft, draftRevision: 3, sceneContentHash: nextHash },
    bindingPayloadHash: undefined as never,
  });
  const syncPlan = planSceneClipSync(item, {
    requestId: 'sync-1',
    itemId: item.id,
    expectedItemFingerprint: computeSceneClipItemFingerprint(item),
    expectedBindingPayloadHash: binding.bindingPayloadHash,
    binding: nextBinding,
    timingPolicy: 'preserve-timeline',
  }, 30);
  assert.equal(syncPlan.changed, true);
  assert.equal(syncPlan.changeSummary.sceneChanged, true);
  draft.commands.batch(syncPlan.actions as never, 'Sync Better Chat Cut scene clip');
  const synced = draft.getState().items[0]!;
  assert.equal(synced.startFrame, 5);
  assert.equal(synced.durationInFrames, item.durationInFrames);
  assert.equal(synced.track, item.track);
}

console.log('scene-clip-session.verify: ok');
