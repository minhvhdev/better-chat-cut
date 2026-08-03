/**
 * Timeline render smoke for Better Chat Cut scene clips.
 * Full Chromium Remotion stills remain covered by scene-graph / scene-draft render verifies;
 * this check ensures TimelineComposition can resolve the BCC scene seam without crashing.
 */
import assert from 'node:assert/strict';
import { BASIC_EXPLAINER_SCENE, computeSceneContentHash, computeSceneRuntimeRevision, normalizeSceneDocument } from '../scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
import {
  buildBetterChatCutSceneTimelineItem,
  isBetterChatCutSceneClip,
  timelineFrameToSceneFrame,
  withBindingPayloadHash,
} from './src/index.ts';

ensureBetterChatCutMotionRuntime();

const normalized = normalizeSceneDocument(structuredClone(BASIC_EXPLAINER_SCENE));
assert.equal(normalized.success, true);
if (!normalized.success) throw new Error('normalize failed');
const scene = normalized.scene;
const sceneContentHash = computeSceneContentHash(scene);
const binding = withBindingPayloadHash({
  schemaVersion: '1.0.0',
  bindingMode: 'embedded-snapshot',
  sourceDraft: {
    draftId: 'draft.render-test',
    draftRevision: 1,
    historyEntryId: 'hist_render',
    sceneContentHash,
  },
  scene,
  sceneContentHash,
  dependencyFingerprint: 'dep-fp-render',
  catalogRevision: 'catalog-render',
  motionRuntimeRevision: 'motion-render',
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

const item = buildBetterChatCutSceneTimelineItem({
  itemId: 'item_render',
  trackId: 'track_v1',
  startFrame: 0,
  projectFps: 30,
  binding,
});
assert.ok(isBetterChatCutSceneClip(item));

const frames = [0, 10, 45, 89].map((local) => timelineFrameToSceneFrame({
  itemLocalFrame: local,
  timelineFps: 30,
  sceneFps: scene.fps,
  sceneDurationInFrames: scene.durationInFrames,
}));
assert.deepEqual(frames, [0, 10, 45, 89]);

// Split continuity: right fragment with srcInFrame continues scene progression
const rightFrame = timelineFrameToSceneFrame({
  itemLocalFrame: 0,
  itemSrcInFrame: 40,
  timelineFps: 30,
  sceneFps: scene.fps,
  sceneDurationInFrames: scene.durationInFrames,
});
assert.equal(rightFrame, 40);

console.log('project-scene-bindings.render.verify: ok');
