import assert from 'node:assert/strict';
import {
  BASIC_EXPLAINER_SCENE,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  normalizeSceneDocument,
} from '../scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
import {
  BETTER_CHAT_CUT_SCENE_PROPS_KEY,
  BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
  buildBetterChatCutSceneTimelineItem,
  compareSceneClipWithBinding,
  computeSceneClipBindingPayloadHash,
  computeSceneClipItemFingerprint,
  isBetterChatCutSceneClip,
  planSceneClipSync,
  sceneDurationToTimelineFrames,
  timelineFrameToSceneFrame,
  validateSceneClipBinding,
  withBindingPayloadHash,
  type SceneClipBindingV1,
} from './src/index.ts';

ensureBetterChatCutMotionRuntime();

function sampleBinding(overrides: Partial<SceneClipBindingV1> = {}): SceneClipBindingV1 {
  const normalized = normalizeSceneDocument(structuredClone(BASIC_EXPLAINER_SCENE));
  assert.equal(normalized.success, true);
  if (!normalized.success) throw new Error('normalize failed');
  const scene = normalized.scene;
  const sceneContentHash = computeSceneContentHash(scene);
  const withoutHash = {
    schemaVersion: '1.0.0' as const,
    bindingMode: 'embedded-snapshot' as const,
    sourceDraft: {
      draftId: 'draft.test-scene',
      draftRevision: 1,
      historyEntryId: 'hist_1',
      sceneContentHash,
    },
    scene,
    sceneContentHash,
    dependencyFingerprint: 'dep-fp-test',
    catalogRevision: 'catalog-test',
    motionRuntimeRevision: 'motion-test',
    sceneRuntimeRevision: computeSceneRuntimeRevision(),
    dependencies: {
      assets: [
        { id: 'primitive.circle', version: '1.0.0', contentHash: 'c1', status: 'published' as const },
        { id: 'background.solid', version: '1.0.0', contentHash: 'b1', status: 'published' as const },
      ],
      animations: [{ id: 'animation.pop-in', version: '1.0.0' }],
      theme: { id: 'default', version: '1.0.0' },
    },
  };
  const binding = withBindingPayloadHash(withoutHash);
  return { ...binding, ...overrides, bindingPayloadHash: overrides.bindingPayloadHash ?? binding.bindingPayloadHash };
}

// Hash stability
{
  const a = sampleBinding();
  const b = sampleBinding();
  // reorder deps
  b.dependencies.assets = [...b.dependencies.assets].reverse();
  const hashA = computeSceneClipBindingPayloadHash({ ...a, bindingPayloadHash: undefined! });
  const without = { ...b };
  delete (without as { bindingPayloadHash?: string }).bindingPayloadHash;
  const hashB = computeSceneClipBindingPayloadHash(without as never);
  assert.equal(a.bindingPayloadHash, hashA);
  assert.equal(hashA, hashB);
}

// Validator
{
  const ok = validateSceneClipBinding(sampleBinding());
  assert.equal(ok.valid, true);
  const bad = validateSceneClipBinding({ ...sampleBinding(), schemaVersion: '9.0.0' });
  assert.equal(bad.valid, false);
  const tampered = sampleBinding();
  tampered.bindingPayloadHash = '0'.repeat(64);
  assert.equal(validateSceneClipBinding(tampered).valid, false);
}

// Duration conversion
assert.equal(sceneDurationToTimelineFrames({ sceneDurationInFrames: 90, sceneFps: 30, timelineFps: 30 }), 90);
assert.equal(sceneDurationToTimelineFrames({ sceneDurationInFrames: 90, sceneFps: 24, timelineFps: 30 }), 113);
assert.equal(sceneDurationToTimelineFrames({ sceneDurationInFrames: 90, sceneFps: 60, timelineFps: 30 }), 45);
assert.equal(sceneDurationToTimelineFrames({ sceneDurationInFrames: 1, sceneFps: 30, timelineFps: 24 }), 1);

// Frame mapping
assert.equal(timelineFrameToSceneFrame({
  itemLocalFrame: 0, timelineFps: 30, sceneFps: 30, sceneDurationInFrames: 90,
}), 0);
assert.equal(timelineFrameToSceneFrame({
  itemLocalFrame: 89, timelineFps: 30, sceneFps: 30, sceneDurationInFrames: 90,
}), 89);
assert.equal(timelineFrameToSceneFrame({
  itemLocalFrame: 200, timelineFps: 30, sceneFps: 30, sceneDurationInFrames: 90,
}), 89);
assert.equal(timelineFrameToSceneFrame({
  itemLocalFrame: 0, itemSrcInFrame: 30, timelineFps: 30, sceneFps: 30, sceneDurationInFrames: 90,
}), 30);
assert.equal(timelineFrameToSceneFrame({
  itemLocalFrame: 15, timelineFps: 30, sceneFps: 60, sceneDurationInFrames: 180,
}), 30);

// Item builder
{
  const binding = sampleBinding();
  const item = buildBetterChatCutSceneTimelineItem({
    itemId: 'item_1',
    trackId: 'V1',
    startFrame: 10,
    projectFps: 30,
    binding,
  });
  assert.equal(item.kind, 'motion-graphic');
  assert.equal(item.templateId, BETTER_CHAT_CUT_SCENE_TEMPLATE_ID);
  assert.ok(item.props?.[BETTER_CHAT_CUT_SCENE_PROPS_KEY]);
  assert.equal(item.width, 1280);
  assert.equal(item.height, 720);
  assert.equal(item.durationInFrames, 90);
  assert.ok(isBetterChatCutSceneClip(item));
  const fp = computeSceneClipItemFingerprint(item);
  assert.equal(typeof fp, 'string');
  assert.equal(fp.length, 64);
}

// Compare / sync no-op
{
  const binding = sampleBinding();
  const item = buildBetterChatCutSceneTimelineItem({
    itemId: 'item_2',
    trackId: 'V1',
    startFrame: 0,
    projectFps: 30,
    binding,
  });
  const cmp = compareSceneClipWithBinding({ item, currentDraftBinding: binding });
  assert.equal(cmp.status, 'synced');
  const plan = planSceneClipSync(item, {
    requestId: 'req-1',
    itemId: item.id,
    expectedItemFingerprint: computeSceneClipItemFingerprint(item),
    expectedBindingPayloadHash: binding.bindingPayloadHash,
    binding,
  }, 30);
  assert.equal(plan.changed, false);
}

console.log('project-scene-bindings.verify: ok');
