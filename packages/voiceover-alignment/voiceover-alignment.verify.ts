import assert from 'node:assert/strict';
import { sampleNarrationPlan } from '../narration-plans/narration-plans.verify.ts';
import { alignNarrationToTranscript, stripAccents, tokenizeAlignment } from './src/index.ts';
import { estimateWordTimings } from '../narration-plans/src/timing/estimated-word-timing.ts';

{
  assert.equal(stripAccents('Đường'), 'duong');
  assert.ok(tokenizeAlignment('Xin chào Việt Nam').includes('xin'));
}

{
  const plan = sampleNarrationPlan();
  const allText = plan.scenes.flatMap((s) => s.segments.map((seg) => seg.text)).join(' ');
  const words = estimateWordTimings({ text: allText, durationMs: 6000, language: 'vi-VN' });
  // Expand words to cover each segment approximately by splitting evenly
  const transcript = words;

  const aligned = alignNarrationToTranscript({
    narrationPlan: plan,
    transcriptWords: transcript,
    voiceoverSource: { type: 'media-asset', mediaAssetId: 'media_vo_1' },
    sourceRevision: 'rev1',
    durationMs: 6000,
    mode: 'transcript',
  });
  // May be medium/high depending on tokenization — ensure deterministic structure
  assert.equal(aligned.narrationPlanId, plan.id);
  assert.equal(aligned.segments.length, 3);
  assert.ok(aligned.voiceover.transcriptHash);
}

{
  const plan = sampleNarrationPlan();
  const missing = alignNarrationToTranscript({
    narrationPlan: plan,
    transcriptWords: [],
    voiceoverSource: { type: 'timeline-item', itemId: 'item_1' },
    sourceRevision: 'rev1',
    durationMs: 1000,
    transcriptStale: false,
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((e) => e.code === 'NARRATION_VOICEOVER_TRANSCRIPT_MISSING'));
}

{
  const plan = sampleNarrationPlan();
  const words = [
    { text: 'Bức', start: 0, end: 200 },
    { text: 'xạ', start: 200, end: 400 },
    { text: 'Hawking', start: 400, end: 800 },
    { text: 'là', start: 800, end: 1000 },
    { text: 'hiện', start: 1000, end: 1200 },
    { text: 'tượng', start: 1200, end: 1500 },
    { text: 'lượng', start: 1500, end: 1800 },
    { text: 'tử', start: 1800, end: 2000 },
    { text: 'tại', start: 2000, end: 2200 },
    { text: 'chân', start: 2200, end: 2400 },
    { text: 'trời', start: 2400, end: 2600 },
    { text: 'sự', start: 2600, end: 2800 },
    { text: 'kiện', start: 2800, end: 3000 },
    { text: 'Các', start: 3200, end: 3400 },
    { text: 'cặp', start: 3400, end: 3600 },
    { text: 'hạt', start: 3600, end: 3800 },
    { text: 'ảo', start: 3800, end: 4000 },
    { text: 'xuất', start: 4000, end: 4200 },
    { text: 'hiện', start: 4200, end: 4400 },
    { text: 'gần', start: 4400, end: 4600 },
    { text: 'chân', start: 4600, end: 4800 },
    { text: 'trời', start: 4800, end: 5000 },
    { text: 'Một', start: 5200, end: 5400 },
    { text: 'hạt', start: 5400, end: 5600 },
    { text: 'rơi', start: 5600, end: 5800 },
    { text: 'vào', start: 5800, end: 6000 },
    { text: 'hố', start: 6000, end: 6200 },
    { text: 'đen', start: 6200, end: 6400 },
  ];
  const aligned = alignNarrationToTranscript({
    narrationPlan: plan,
    transcriptWords: words,
    voiceoverSource: { type: 'media-asset', mediaAssetId: 'media_vo_1' },
    sourceRevision: 'rev2',
    durationMs: 7000,
  });
  assert.equal(aligned.segments.length, 3);
  // Monotonic
  for (let i = 1; i < aligned.segments.length; i += 1) {
    const prev = aligned.segments[i - 1]!;
    const cur = aligned.segments[i]!;
    if (prev.endMs != null && cur.startMs != null) {
      assert.ok(cur.startMs >= prev.endMs - 1);
    }
  }
}

{
  const plan = sampleNarrationPlan();
  const words = estimateWordTimings({ text: 'filler words only here', durationMs: 2000, language: 'en' });
  const manual = alignNarrationToTranscript({
    narrationPlan: plan,
    transcriptWords: words,
    voiceoverSource: { type: 'media-asset', mediaAssetId: 'm1' },
    sourceRevision: 'r',
    durationMs: 2000,
    mode: 'manual',
    overrides: [
      { segmentId: 'seg_intro_1', startMs: 0, endMs: 500 },
      { segmentId: 'seg_body_1', startMs: 500, endMs: 1200 },
      { segmentId: 'seg_body_2', startMs: 1200, endMs: 2000 },
    ],
  });
  assert.equal(manual.valid, true, JSON.stringify(manual.errors));
  assert.ok(manual.timingSnapshot);
  assert.equal(manual.segments.every((s) => s.confidence === 'high'), true);
}

{
  const plan = sampleNarrationPlan();
  const a = alignNarrationToTranscript({
    narrationPlan: plan,
    transcriptWords: estimateWordTimings({ text: 'abc', durationMs: 1000, language: 'en' }),
    voiceoverSource: { type: 'media-asset', mediaAssetId: 'm1' },
    sourceRevision: 'r',
    durationMs: 1000,
    mode: 'manual',
    overrides: [{ segmentId: 'seg_intro_1', startWordIndex: 0, endMs: 10 }],
  });
  assert.equal(a.segments[0]!.confidence, 'failed');
}

console.log('voiceover-alignment.verify: ok');
