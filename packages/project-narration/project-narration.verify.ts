import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sampleNarrationPlan } from '../narration-plans/narration-plans.verify.ts';
import {
  validateNarrationPlan,
  resolveTemporaryTtsTiming,
  buildSceneAudioTimingFromSegments,
  estimateWordTimings,
} from '../narration-plans/src/index.ts';
import { createNarrationSynthesisService, encodeToneWav } from '../narration-audio/src/index.ts';
import {
  previewNarrationTimelineApply,
  planNarrationTimelineApply,
  inspectNarrationTimeline,
  serializeSrt,
  serializeWebVtt,
  buildSubtitleCues,
  exportSubtitles,
  BETTER_CHAT_CUT_NARRATION_PROPS_KEY,
  type NarrationTimelineLike,
} from './src/index.ts';
import { planVideoPlanAssembly } from '../project-video-assembly/src/index.ts';
import { emptyProjectDoc } from '../../src/agent/tools/project-tools.ts';
import { makeDraft, projectReduce, type AnyAction } from '../../src/editor/store.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

const root = mkdtempSync(join(tmpdir(), 'bcc-project-narration-'));

function asTimeline(doc: ReturnType<typeof emptyProjectDoc>, draftItems?: NarrationTimelineLike['items']): NarrationTimelineLike {
  const tl = doc.timelines[0]!;
  return {
    id: tl.id,
    name: tl.name,
    width: tl.width,
    height: tl.height,
    fps: tl.fps,
    fit: tl.fit,
    items: (draftItems ?? tl.items) as NarrationTimelineLike['items'],
    tracks: tl.tracks as NarrationTimelineLike['tracks'],
    transitions: tl.transitions as NarrationTimelineLike['transitions'],
    markers: tl.markers as NarrationTimelineLike['markers'],
  };
}

// SRT / VTT
{
  const words = estimateWordTimings({ text: 'Hello world from Better Chat Cut', durationMs: 2000, language: 'en' });
  const cues = buildSubtitleCues({ words, pacing: 'phrase' });
  assert.ok(cues.length >= 1);
  const srt = serializeSrt(cues);
  assert.ok(srt.includes('-->'));
  assert.ok(srt.includes(','));
  assert.ok(srt.endsWith('\n'));
  const vtt = serializeWebVtt(cues);
  assert.ok(vtt.startsWith('WEBVTT\n'));
  assert.ok(vtt.includes('.'));
  assert.ok(vtt.endsWith('\n'));
  const unicode = serializeSrt([{ index: 1, startMs: 0, endMs: 500, text: 'Xin chào Việt Nam' }]);
  assert.ok(unicode.includes('Việt'));
}

// End-to-end temporary TTS timing + timeline apply
{
  const service = createNarrationSynthesisService({
    narrationRoot: root,
    now: () => '2026-01-01T00:00:00.000Z',
    provider: async (req) => {
      const text = String(req.text ?? '');
      const durationMs = Math.max(600, text.length * 35);
      return { audio: encodeToneWav(durationMs), durationMs, codec: 'wav', sampleRate: 24000 };
    },
  });

  const plan = sampleNarrationPlan();
  const prepared = await service.prepare({
    requestId: 'pn-apply-1',
    narrationPlan: plan,
    dryRun: false,
  });
  assert.ok(prepared.submittedCount >= 3);

  const validated = validateNarrationPlan(plan);
  assert.ok(validated.valid && validated.normalizedPlan && validated.narrationPlanHash);
  const artifacts = service.collectCompletedArtifacts(validated.normalizedPlan, validated.narrationPlanHash);
  const segmentMap = new Map(
    [...artifacts.entries()].map(([id, art]) => [id, {
      durationMs: art.durationMs,
      words: art.wordTiming.words,
      timingQuality: art.wordTiming.quality,
      audioArtifactId: art.artifactId,
    }]),
  );
  const sceneAudios = buildSceneAudioTimingFromSegments({
    narrationPlan: validated.normalizedPlan,
    segmentArtifacts: segmentMap,
  });
  const timing = resolveTemporaryTtsTiming({
    narrationPlan: validated.normalizedPlan,
    sceneAudios,
    synthesisManifestHash: 'manifest-test',
  });
  assert.ok(timing.timingSnapshot, JSON.stringify(timing.errors));
  assert.ok(timing.timingSnapshot!.timedVideoPlanHash);

  const live = emptyProjectDoc({ fps: 30, width: 1280, height: 720 });
  const draft = makeDraft(live);
  let seq = 0;
  const assembled = planVideoPlanAssembly({
    plan: validated.normalizedPlan.videoPlan,
    timeline: {
      ...asTimeline(draft.getDoc()),
      items: draft.getState().items as NarrationTimelineLike['items'],
      transitions: draft.getState().transitions as NarrationTimelineLike['transitions'],
      markers: draft.getState().markers as NarrationTimelineLike['markers'],
      tracks: draft.getState().tracks as NarrationTimelineLike['tracks'],
    },
    requestId: 'vp-base-1',
    uid: (p) => `${p}_${++seq}`,
  });
  draft.commands.batch(assembled.actions as never, assembled.result.actionSummary);

  const snap = timing.timingSnapshot!;
  const timelineAfterAssembly: NarrationTimelineLike = {
    ...asTimeline(draft.getDoc()),
    items: draft.getState().items as NarrationTimelineLike['items'],
    transitions: draft.getState().transitions as NarrationTimelineLike['transitions'],
    markers: draft.getState().markers as NarrationTimelineLike['markers'],
    tracks: draft.getState().tracks as NarrationTimelineLike['tracks'],
  };

  const preview = previewNarrationTimelineApply({
    timingSnapshot: snap,
    timeline: timelineAfterAssembly,
  });
  assert.ok(preview.audioTrack.trackId);
  assert.ok(preview.visualChanges.length >= 1);

  const planned = planNarrationTimelineApply({
    timingSnapshot: snap,
    timeline: timelineAfterAssembly,
    requestId: 'narr-apply-1',
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
  assert.ok(planned.actions.length > 0);

  const actions = planned.actions.filter((a) => a.type !== 'setCaptions');
  draft.commands.batch(actions as never, planned.result.actionSummary);

  const narrItems = draft.getState().items.filter((i) => i.props && BETTER_CHAT_CUT_NARRATION_PROPS_KEY in (i.props as object));
  assert.ok(narrItems.length >= 1);

  const inspection = inspectNarrationTimeline({
    timingSnapshot: snap,
    timeline: {
      ...timelineAfterAssembly,
      items: draft.getState().items as NarrationTimelineLike['items'],
      tracks: draft.getState().tracks as NarrationTimelineLike['tracks'],
    },
  });
  assert.ok(['complete', 'incomplete', 'drifted'].includes(inspection.status));

  // Apply recorded actions onto live project as one undoable batch stream
  const recorded = draft.takeActions();
  const applied = recorded.reduce((doc, action) => projectReduce(doc, action as AnyAction), live);
  assert.ok(applied.timelines[0]!.items.some((i) => i.props && BETTER_CHAT_CUT_NARRATION_PROPS_KEY in (i.props as object)));

  // Idempotent replay against draft state after apply
  const replay = planNarrationTimelineApply({
    timingSnapshot: snap,
    timeline: {
      ...asTimeline(applied),
      items: applied.timelines[0]!.items as NarrationTimelineLike['items'],
      tracks: applied.timelines[0]!.tracks as NarrationTimelineLike['tracks'],
    },
    requestId: 'narr-apply-1',
    uid: (p) => `${p}_replay`,
  });
  assert.equal(replay.result.replayed, true);

  const exported = exportSubtitles({
    words: snap.captionWords,
    formats: ['srt', 'vtt'],
    narrationPlanId: snap.narrationPlanId,
    narrationPlanHash: snap.narrationPlanHash,
    timingHash: snap.timingHash,
    narrationRoot: root,
  });
  assert.equal(exported.artifacts.length, 2);
  assert.ok(exported.artifacts[0]!.text?.includes('-->'));
}

console.log('project-narration.verify: ok');
