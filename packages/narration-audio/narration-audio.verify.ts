import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sampleNarrationPlan } from '../narration-plans/narration-plans.verify.ts';
import {
  createNarrationSynthesisService,
  parseProviderSubtitleTiming,
  computeNarrationSynthesisInputHash,
  encodeToneWav,
  probeWavDurationMs,
  buildSceneAudioArtifact,
} from './src/index.ts';
import { validateNarrationPlan } from '../narration-plans/src/index.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-narration-audio-'));

// Provider subtitle parser
{
  const durationMs = 1000;
  const words = parseProviderSubtitleTiming({
    raw: { words: [{ text: 'Hello', start: 0, end: 400 }, { text: 'world', start: 400, end: 1000 }] },
    text: 'Hello world',
    durationMs,
    language: 'en',
    requested: 'word',
  });
  assert.equal(words.quality, 'provider-word');
  assert.equal(words.words.length, 2);

  const sentences = parseProviderSubtitleTiming({
    raw: { sentences: [{ text: 'Hello world', start: 0, end: 1000 }] },
    text: 'Hello world',
    durationMs,
    language: 'en',
    requested: 'sentence',
  });
  assert.equal(sentences.quality, 'provider-sentence');
  assert.ok(sentences.words.length >= 2);

  const estimated = parseProviderSubtitleTiming({
    raw: null,
    text: 'Xin chào',
    durationMs,
    language: 'vi-VN',
  });
  assert.equal(estimated.quality, 'estimated-word');

  const invalid = parseProviderSubtitleTiming({
    raw: '{not-json',
    text: 'Fallback',
    durationMs,
    language: 'en',
  });
  assert.equal(invalid.quality, 'estimated-word');
}

// Synthesis service with fake provider
{
  let providerCalls = 0;
  const service = createNarrationSynthesisService({
    narrationRoot: root,
    now: () => '2026-01-01T00:00:00.000Z',
    provider: async (req) => {
      providerCalls += 1;
      const text = String(req.text ?? '');
      const durationMs = Math.max(500, text.length * 40);
      return {
        audio: encodeToneWav(durationMs),
        durationMs,
        codec: 'wav',
        sampleRate: 24000,
        subtitle: {
          words: estimateFakeWords(text, durationMs),
        },
      };
    },
  });

  function estimateFakeWords(text: string, durationMs: number) {
    const parts = text.split(/\s+/).filter(Boolean);
    const span = durationMs / Math.max(parts.length, 1);
    return parts.map((t, i) => ({ text: t, start: Math.floor(i * span), end: Math.floor((i + 1) * span) }));
  }

  const plan = sampleNarrationPlan();
  const dry = await service.prepare({
    requestId: 'req-dry-1',
    narrationPlan: plan,
    dryRun: true,
  });
  assert.equal(dry.dryRun, true);
  assert.equal(providerCalls, 0);
  assert.ok(dry.segments.every((s) => s.status === 'would-synthesize'));

  const apply = await service.prepare({
    requestId: 'req-apply-1',
    narrationPlan: plan,
    dryRun: false,
  });
  assert.ok(apply.submittedCount >= 3);
  assert.equal(providerCalls, apply.submittedCount);

  const _replay = await service.prepare({
    requestId: 'req-apply-1',
    narrationPlan: plan,
    dryRun: false,
  });
  assert.equal(providerCalls, apply.submittedCount); // idempotent, no new calls

  const cached = await service.prepare({
    requestId: 'req-apply-2',
    narrationPlan: plan,
    dryRun: false,
  });
  assert.ok(cached.cacheHitCount >= 3);
  assert.equal(providerCalls, apply.submittedCount);

  // request conflict
  let conflicted = false;
  try {
    await service.prepare({
      requestId: 'req-apply-1',
      narrationPlan: sampleNarrationPlan({
        scenes: [{ sceneEntryId: 'intro', segments: [{ id: 'seg_intro_1', text: 'Different' }] }],
      }),
      dryRun: false,
    });
  } catch {
    conflicted = true;
  }
  assert.equal(conflicted, true);

  const validated = validateNarrationPlan(plan);
  assert.ok(validated.narrationPlanHash);
  const status = await service.getStatus({
    narrationPlanId: plan.id,
    narrationPlanHash: validated.narrationPlanHash!,
  });
  assert.ok(status.status === 'complete' || status.status === 'partially-complete');

  const artifacts = service.collectCompletedArtifacts(validated.normalizedPlan!, validated.narrationPlanHash!);
  assert.equal(artifacts.size, 3);

  // Scene audio
  const bytes = new Map<string, Buffer>();
  for (const art of artifacts.values()) {
    const b = service.getAudioBytes(art.audioContentHash);
    assert.ok(b && b.byteLength > 0);
    bytes.set(art.audioContentHash, b!);
    assert.ok(probeWavDurationMs(b!) > 0);
  }
  const sceneAudio = buildSceneAudioArtifact({
    narrationPlan: validated.normalizedPlan!,
    narrationPlanHash: validated.narrationPlanHash!,
    sceneEntryId: 'body',
    segmentArtifacts: [...artifacts.values()].filter((a) => a.sceneEntryId === 'body'),
    audioBytesByContentHash: bytes,
    narrationRoot: root,
  });
  assert.ok(sceneAudio.durationMs > 0);
  assert.ok(sceneAudio.words.length > 0);
  assert.ok(sceneAudio.artifactHash);
}

// Synthesis input hash ignores credentials-like fields by construction
{
  const a = computeNarrationSynthesisInputHash({
    text: 'hello',
    provider: 'minimax',
    voiceId: 'v1',
  });
  const b = computeNarrationSynthesisInputHash({
    text: 'hello',
    provider: 'minimax',
    voiceId: 'v1',
  });
  assert.equal(a, b);
  const c = computeNarrationSynthesisInputHash({
    text: 'hello!',
    provider: 'minimax',
    voiceId: 'v1',
  });
  assert.notEqual(a, c);
}

console.log('narration-audio.verify: ok');
