import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sampleNarrationPlan } from '../narration-plans/narration-plans.verify.ts';
import { validateNarrationPlan, resolveTemporaryTtsTiming, buildSceneAudioTimingFromSegments } from '../narration-plans/src/index.ts';
import { createNarrationSynthesisService, encodeToneWav } from '../narration-audio/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

const root = mkdtempSync(join(tmpdir(), 'bcc-narration-render-'));
const service = createNarrationSynthesisService({
  narrationRoot: root,
  provider: async (req) => {
    const text = String(req.text ?? '');
    const durationMs = Math.max(400, text.length * 25);
    return { audio: encodeToneWav(durationMs), durationMs, codec: 'wav', sampleRate: 24000 };
  },
});

const plan = sampleNarrationPlan();
await service.prepare({ requestId: 'render-1', narrationPlan: plan, dryRun: false });
const validated = validateNarrationPlan(plan);
assert.ok(validated.valid && validated.normalizedPlan && validated.narrationPlanHash);
const artifacts = service.collectCompletedArtifacts(validated.normalizedPlan, validated.narrationPlanHash);
const segmentMap = new Map([...artifacts.entries()].map(([id, art]) => [id, {
  durationMs: art.durationMs,
  words: art.wordTiming.words,
  timingQuality: art.wordTiming.quality,
  audioArtifactId: art.artifactId,
}]));
const timing = resolveTemporaryTtsTiming({
  narrationPlan: validated.normalizedPlan,
  sceneAudios: buildSceneAudioTimingFromSegments({
    narrationPlan: validated.normalizedPlan,
    segmentArtifacts: segmentMap,
  }),
  synthesisManifestHash: 'render-manifest',
});
assert.ok(timing.timingSnapshot);
assert.ok(timing.timingSnapshot!.captionWords.length > 0);
assert.ok(timing.timingSnapshot!.scenes.some((s) => s.durationInFrames >= 1));
console.log('project-narration.render.verify: ok');
