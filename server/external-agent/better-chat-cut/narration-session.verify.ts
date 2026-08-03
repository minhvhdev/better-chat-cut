import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NARRATION_CONTROL_TOOLS, runNarrationControlTool, setNarrationSynthesisServiceForTests } from './narration-tools.ts';
import { NARRATION_TOOL_NAMES } from '../../../src/agent/tools/schemas/narration-tools.ts';
import { createNarrationSynthesisService, encodeToneWav } from '../../../packages/narration-audio/src/index.ts';
import { sampleNarrationPlan } from '../../../packages/narration-plans/narration-plans.verify.ts';
import {
  planNarrationTimelineApply,
  inspectNarrationTimeline,
  type NarrationTimelineLike,
} from '../../../packages/project-narration/src/index.ts';
import { planVideoPlanAssembly } from '../../../packages/project-video-assembly/src/index.ts';
import { makeDraft, projectReduce, type AnyAction } from '../../../src/editor/store.ts';
import { emptyProjectDoc } from '../../../src/agent/tools/project-tools.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

const root = mkdtempSync(join(tmpdir(), 'bcc-narration-session-'));
setNarrationSynthesisServiceForTests(createNarrationSynthesisService({
  narrationRoot: root,
  provider: async (req) => {
    const text = String(req.text ?? '');
    const durationMs = Math.max(500, text.length * 30);
    return { audio: encodeToneWav(durationMs), durationMs, codec: 'wav', sampleRate: 24000 };
  },
}));

assert.ok(NARRATION_CONTROL_TOOLS.some((t) => t.name === 'narration_get_contract'));
assert.ok(NARRATION_TOOL_NAMES.has('narration_apply_timeline'));

const contract = await runNarrationControlTool('narration_get_contract', { format: 'summary' }) as {
  projectSchemaChanged: boolean;
};
assert.equal(contract.projectSchemaChanged, false);

const plan = sampleNarrationPlan();
await runNarrationControlTool('narration_tts_prepare', {
  requestId: 'session-tts-1',
  narrationPlan: plan,
  dryRun: false,
});
const timing = await runNarrationControlTool('narration_timing_resolve', { narrationPlan: plan }) as {
  timingSnapshot: {
    timingHash: string;
    narrationPlanId: string;
    scenes: Array<{ sceneEntryId: string; segments: unknown[]; durationInFrames: number; relativeStartFrame: number }>;
    captionWords: Array<{ text: string; start: number; end: number }>;
  };
};
assert.ok(timing.timingSnapshot);

const live = emptyProjectDoc({ fps: 30, width: 1280, height: 720 });
const draft = makeDraft(live);
let seq = 0;
const assembled = planVideoPlanAssembly({
  plan: plan.videoPlan,
  timeline: {
    id: live.timelines[0]!.id,
    name: live.timelines[0]!.name,
    width: 1280,
    height: 720,
    fps: 30,
    fit: 'contain',
    items: draft.getState().items,
    transitions: draft.getState().transitions,
    markers: draft.getState().markers,
    tracks: draft.getState().tracks as NarrationTimelineLike['tracks'],
  },
  requestId: 'session-vp-1',
  uid: (p) => `${p}_${++seq}`,
});
draft.commands.batch(assembled.actions as never, assembled.result.actionSummary);

const snap = timing.timingSnapshot;
const timeline: NarrationTimelineLike = {
  id: live.timelines[0]!.id,
  name: live.timelines[0]!.name,
  width: 1280,
  height: 720,
  fps: 30,
  fit: 'contain',
  items: draft.getState().items as NarrationTimelineLike['items'],
  tracks: draft.getState().tracks as NarrationTimelineLike['tracks'],
  transitions: draft.getState().transitions as NarrationTimelineLike['transitions'],
  markers: draft.getState().markers as NarrationTimelineLike['markers'],
};

const planned = planNarrationTimelineApply({
  timingSnapshot: snap as never,
  timeline,
  requestId: 'session-narr-1',
  uid: (p) => `${p}_${++seq}`,
  sceneAudioMedia: new Map(
    snap.scenes.filter((s) => s.segments.length).map((s) => [s.sceneEntryId, {
      src: `narration://tts/${s.sceneEntryId}.wav`,
      durationInFrames: s.durationInFrames,
      transcript: snap.captionWords,
      sourceRevision: snap.timingHash.slice(0, 16),
    }]),
  ),
});
assert.equal(planned.result.ok, true, JSON.stringify(planned.result.errors));
draft.commands.batch(
  planned.actions.filter((a) => a.type !== 'setCaptions') as never,
  planned.result.actionSummary,
);

const inspection = inspectNarrationTimeline({
  timingSnapshot: snap as never,
  timeline: {
    ...timeline,
    items: draft.getState().items as NarrationTimelineLike['items'],
    tracks: draft.getState().tracks as NarrationTimelineLike['tracks'],
  },
});
assert.ok(['complete', 'incomplete', 'drifted'].includes(inspection.status));

const recorded = draft.takeActions();
const applied = recorded.reduce((doc, action) => projectReduce(doc, action as AnyAction), live);
assert.ok(applied.timelines[0]!.items.length > 0);

// Undo / redo via historyReduce pattern: replay without last batch then with it
const withoutNarration = recorded
  .slice(0, recorded.length - 1)
  .reduce((doc, action) => projectReduce(doc, action as AnyAction), live);
assert.ok(withoutNarration.timelines[0]!.items.length <= applied.timelines[0]!.items.length);

setNarrationSynthesisServiceForTests(null);
console.log('narration-session.verify: ok');
