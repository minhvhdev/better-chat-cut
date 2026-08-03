import assert from 'node:assert/strict';
import {
  BASIC_EXPLAINER_SCENE,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  normalizeSceneDocument,
} from '../scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
import {
  assertReservedPropsNotPatched,
  withBindingPayloadHash,
  type SceneClipBindingV1,
} from '../project-scene-bindings/src/index.ts';
import { validateVideoPlan } from '../video-plans/src/index.ts';
import {
  BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY,
  previewVideoPlanAssembly,
  planVideoPlanAssembly,
  inspectVideoPlanAssembly,
  analyzeAssemblyCollisions,
  type AssemblyTimelineLike,
} from './src/index.ts';
import { makeDraft, projectReduce, type AnyAction } from '../../src/editor/store.ts';
import { emptyProjectDoc } from '../../src/agent/tools/project-tools.ts';

ensureBetterChatCutMotionRuntime();

function sampleBinding(sceneId = 'scene.basic-explainer'): SceneClipBindingV1 {
  const normalized = normalizeSceneDocument(structuredClone(BASIC_EXPLAINER_SCENE));
  assert.equal(normalized.success, true);
  if (!normalized.success) throw new Error('normalize failed');
  const scene = { ...normalized.scene, id: sceneId };
  const sceneContentHash = computeSceneContentHash(scene);
  return withBindingPayloadHash({
    schemaVersion: '1.0.0',
    bindingMode: 'embedded-snapshot',
    sourceDraft: {
      draftId: 'draft.assembly',
      draftRevision: 1,
      historyEntryId: 'hist_asm',
      sceneContentHash,
    },
    scene,
    sceneContentHash,
    dependencyFingerprint: 'dep-fp-asm',
    catalogRevision: 'catalog-asm',
    motionRuntimeRevision: 'motion-asm',
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

function planFor(timeline: { width: number; height: number; fps: number }) {
  return {
    schemaVersion: '1.0.0' as const,
    id: 'video-plan.assembly-verify',
    name: 'Assembly verify',
    output: { width: timeline.width, height: timeline.height, fps: timeline.fps, fit: 'contain' as const },
    placement: { mode: 'append' as const, collisionPolicy: 'require-clear' as const },
    markers: { mode: 'boundary' as const, defaultColor: 'blue' as const, notePrefix: 'BCC Scene' },
    scenes: [
      {
        id: 'intro',
        binding: sampleBinding('scene.intro'),
        transitionToNext: { mode: 'timeline-transition' as const, type: 'cross-dissolve' as const, durationInFrames: 12 },
      },
      {
        id: 'body',
        binding: sampleBinding('scene.body'),
        duration: { mode: 'timeline-frames' as const, timelineFrames: 45 },
      },
      {
        id: 'outro',
        binding: sampleBinding('scene.outro'),
      },
    ],
  };
}

function asTimeline(doc: ReturnType<typeof emptyProjectDoc>): AssemblyTimelineLike {
  const tl = doc.timelines[0]!;
  return {
    id: tl.id,
    name: tl.name,
    width: tl.width,
    height: tl.height,
    fps: tl.fps,
    fit: tl.fit,
    items: tl.items,
    transitions: tl.transitions,
    markers: tl.markers,
    tracks: tl.tracks as AssemblyTimelineLike['tracks'],
  };
}

// Reserved props guard
{
  const blocked = assertReservedPropsNotPatched({ [BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY]: {} });
  assert.ok(blocked);
  assert.equal(blocked.code, 'SCENE_CLIP_GENERIC_PROPS_EDIT_BLOCKED');
}

// Preview + assemble on draft
{
  const live = emptyProjectDoc({ fps: 30, width: 1280, height: 720 });
  const draft = makeDraft(live);
  const plan = planFor(live.timelines[0]!);
  const validated = validateVideoPlan(plan);
  assert.equal(validated.valid, true, JSON.stringify(validated.errors));

  const preview = previewVideoPlanAssembly({ plan, timeline: asTimeline(draft.getDoc()) });
  assert.equal(preview.errors.length, 0, JSON.stringify(preview.errors));
  assert.equal(preview.scenes.length, 3);
  assert.equal(preview.transitions.length, 1);

  let seq = 0;
  const planned = planVideoPlanAssembly({
    plan,
    timeline: asTimeline(draft.getDoc()),
    requestId: 'asm-1',
    uid: (prefix) => `${prefix}_${++seq}`,
  });
  assert.equal(planned.result.replayed, false);
  draft.commands.batch(planned.actions as never, planned.result.actionSummary);
  assert.equal(live.timelines[0]!.items.length, 0, 'live unchanged');
  assert.equal(draft.getState().items.length, 3);
  assert.ok(draft.getState().transitions?.length);
  assert.ok(draft.getState().markers?.length);

  const inspection = inspectVideoPlanAssembly({ plan, timeline: asTimeline(draft.getDoc()) });
  assert.equal(inspection.status, 'complete', JSON.stringify(inspection.errors));

  // Idempotent replay — use draft state items (proposal), not live getDoc()
  const replay = planVideoPlanAssembly({
    plan,
    timeline: {
      ...asTimeline(draft.getDoc()),
      items: draft.getState().items,
      transitions: draft.getState().transitions,
      markers: draft.getState().markers,
      tracks: draft.getState().tracks as AssemblyTimelineLike['tracks'],
    },
    requestId: 'asm-1',
    uid: (prefix) => `${prefix}_x`,
  });
  assert.equal(replay.result.replayed, true);
  assert.equal(draft.getState().items.length, 3);

  // Apply one undo step batch
  const actions = draft.takeActions();
  const applied = actions.reduce((doc, action) => projectReduce(doc, action as AnyAction), live);
  assert.equal(applied.timelines[0]!.items.length, 3);
  assert.ok(applied.timelines[0]!.items.every((item) => item.props?.[BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY]));
}

// Collision require-clear
{
  const live = emptyProjectDoc({ fps: 30, width: 1280, height: 720 });
  const tl = live.timelines[0]!;
  const trackId = Object.keys(tl.tracks ?? {}).find((id) => tl.tracks?.[id]?.kind === 'video')
    ?? Object.keys(tl.tracks ?? {})[0]
    ?? 'track_v1';
  tl.items.push({
    id: 'existing',
    track: trackId,
    startFrame: 0,
    durationInFrames: 100,
    kind: 'solid',
    name: 'block',
    width: 1280,
    height: 720,
    props: { color: '#000' },
  });
  const collision = analyzeAssemblyCollisions({
    timeline: asTimeline(live),
    trackId,
    absoluteStartFrame: 0,
    totalDurationInFrames: 50,
    collisionPolicy: 'require-clear',
    placementMode: 'at-frame',
  });
  assert.equal(collision.clear, false);
  assert.ok(collision.conflictingItemIds.includes('existing'));
}

// Ripple insert shifts existing by total duration
{
  const live = emptyProjectDoc({ fps: 30, width: 1280, height: 720 });
  const draft = makeDraft(live);
  const trackId = Object.entries(draft.getState().tracks ?? {}).find(([, t]) => t.kind === 'video')?.[0]
    ?? 'track_v1';
  draft.commands.batch([{
    type: 'add',
    startFrame: 0,
    item: {
      id: 'pre_existing',
      track: trackId,
      durationInFrames: 30,
      kind: 'solid',
      name: 'before',
      width: 1280,
      height: 720,
      props: { color: '#111' },
    },
  }] as never, 'seed');
  // Move existing to frame 50 so insert at 0 with ripple pushes it
  draft.commands.batch([{ type: 'move', id: 'pre_existing', startFrame: 50 }] as never, 'place');

  const plan = {
    ...planFor(live.timelines[0]!),
    placement: { mode: 'at-frame' as const, startFrame: 50, collisionPolicy: 'ripple' as const },
  };
  const validated = validateVideoPlan(plan);
  assert.equal(validated.valid, true, JSON.stringify(validated.errors));
  let seq = 0;
  const planned = planVideoPlanAssembly({
    plan,
    timeline: asTimeline(draft.getDoc()),
    requestId: 'asm-ripple',
    uid: (prefix) => `${prefix}_r${++seq}`,
  });
  const total = planned.result.totalDurationInFrames;
  draft.commands.batch(planned.actions as never, planned.result.actionSummary);
  const existing = draft.getState().items.find((item) => item.id === 'pre_existing');
  assert.ok(existing);
  assert.equal(existing.startFrame, 50 + total);
}

console.log('project-video-assembly.verify: ok');
