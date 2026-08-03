import assert from 'node:assert/strict';
import {
  BASIC_EXPLAINER_SCENE,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  normalizeSceneDocument,
} from '../../../packages/scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';
import { withBindingPayloadHash } from '../../../packages/project-scene-bindings/src/index.ts';
import {
  planVideoPlanAssembly,
  inspectVideoPlanAssembly,
  type AssemblyTimelineLike,
} from '../../../packages/project-video-assembly/src/index.ts';
import { makeDraft, projectReduce, type AnyAction } from '../../../src/editor/store.ts';
import { emptyProjectDoc } from '../../../src/agent/tools/project-tools.ts';
import { VIDEO_PLAN_CONTROL_TOOLS, runVideoPlanControlTool } from './video-plan-tools.ts';
import { VIDEO_PLAN_TOOL_NAMES } from '../../../src/agent/tools/schemas/video-plan-tools.ts';

ensureBetterChatCutMotionRuntime();

function sampleBinding(sceneId: string) {
  const normalized = normalizeSceneDocument(structuredClone(BASIC_EXPLAINER_SCENE));
  assert.equal(normalized.success, true);
  if (!normalized.success) throw new Error('normalize failed');
  const scene = { ...normalized.scene, id: sceneId };
  const sceneContentHash = computeSceneContentHash(scene);
  return withBindingPayloadHash({
    schemaVersion: '1.0.0',
    bindingMode: 'embedded-snapshot',
    sourceDraft: {
      draftId: 'draft.session-vp',
      draftRevision: 1,
      historyEntryId: 'hist_session_vp',
      sceneContentHash,
    },
    scene,
    sceneContentHash,
    dependencyFingerprint: 'dep-fp-session-vp',
    catalogRevision: 'catalog-session-vp',
    motionRuntimeRevision: 'motion-session-vp',
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

function asTimeline(doc: ReturnType<typeof emptyProjectDoc>, items = doc.timelines[0]!.items): AssemblyTimelineLike {
  const tl = doc.timelines[0]!;
  return {
    id: tl.id,
    name: tl.name,
    width: tl.width,
    height: tl.height,
    fps: tl.fps,
    fit: tl.fit,
    items,
    transitions: tl.transitions,
    markers: tl.markers,
    tracks: tl.tracks as AssemblyTimelineLike['tracks'],
  };
}

// Control tools
{
  assert.ok(VIDEO_PLAN_CONTROL_TOOLS.some((tool) => tool.name === 'video_plan_get_contract'));
  assert.ok(VIDEO_PLAN_CONTROL_TOOLS.some((tool) => tool.name === 'video_plan_validate'));
  const contract = await runVideoPlanControlTool('video_plan_get_contract', { format: 'summary' }) as {
    schemaVersion: string;
    projectSchemaChanged: boolean;
  };
  assert.equal(contract.schemaVersion, '1.0.0');
  assert.equal(contract.projectSchemaChanged, false);
  assert.ok(VIDEO_PLAN_TOOL_NAMES.has('video_plan_assemble'));
}

const plan = {
  schemaVersion: '1.0.0' as const,
  id: 'video-plan.session-verify',
  name: 'Session verify',
  output: { width: 1280, height: 720, fps: 30, fit: 'contain' as const },
  placement: { mode: 'append' as const },
  markers: { mode: 'both' as const },
  scenes: [
    {
      id: 'intro',
      binding: sampleBinding('scene.intro'),
      transitionToNext: { mode: 'timeline-transition' as const, type: 'soft-wipe' as const, durationInFrames: 8, direction: 'left' as const },
    },
    { id: 'body', binding: sampleBinding('scene.body') },
    { id: 'outro', binding: sampleBinding('scene.outro') },
  ],
};

const validated = await runVideoPlanControlTool('video_plan_validate', { plan }) as { valid: boolean; errors: unknown[] };
assert.equal(validated.valid, true, JSON.stringify(validated.errors));

// Manual draft isolation + one undo step apply
{
  const live = emptyProjectDoc({ fps: 30, width: 1280, height: 720 });
  const draft = makeDraft(live);
  let seq = 0;
  const planned = planVideoPlanAssembly({
    plan,
    timeline: {
      ...asTimeline(draft.getDoc()),
      items: draft.getState().items,
      transitions: draft.getState().transitions,
      markers: draft.getState().markers,
      tracks: draft.getState().tracks as AssemblyTimelineLike['tracks'],
    },
    requestId: 'session-asm-1',
    uid: (prefix) => `${prefix}_${++seq}`,
  });
  draft.commands.batch(planned.actions as never, planned.result.actionSummary);
  assert.equal(live.timelines[0]!.items.length, 0);
  assert.equal(draft.getState().items.length, 3);
  const inspection = inspectVideoPlanAssembly({
    plan,
    timeline: {
      ...asTimeline(draft.getDoc()),
      items: draft.getState().items,
      transitions: draft.getState().transitions,
      markers: draft.getState().markers,
    },
  });
  assert.equal(inspection.status, 'complete', JSON.stringify(inspection.errors));

  const actions = draft.takeActions();
  const applied = actions.reduce((doc, action) => projectReduce(doc, action as AnyAction), live);
  assert.equal(applied.timelines[0]!.items.length, 3);

  // Drift: move middle clip
  const body = applied.timelines[0]!.items.find((item) => {
    const meta = item.props?.__betterChatCutVideoPlan as { sceneEntryId?: string } | undefined;
    return meta?.sceneEntryId === 'body';
  });
  assert.ok(body);
  body.startFrame += 10;
  const drifted = inspectVideoPlanAssembly({ plan, timeline: asTimeline(applied) });
  assert.equal(drifted.status, 'drifted');
}

console.log('video-plan-session.verify: ok');
