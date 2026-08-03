import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASIC_EXPLAINER_SCENE,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  normalizeSceneDocument,
} from '../scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
import { withBindingPayloadHash } from '../project-scene-bindings/src/index.ts';
import type { SceneClipBindingV1 } from '../project-scene-bindings/src/index.ts';
import type { VideoPlanV1 } from '../video-plans/src/index.ts';
import {
  validateNarrationPlan,
  normalizeNarrationPlan,
  computeNarrationPlanHash,
  computeNarrationRuntimeRevision,
  estimateWordTimings,
  MAX_NARRATION_SEGMENTS,
  type NarrationPlanV1,
} from './src/index.ts';

ensureBetterChatCutMotionRuntime();

function sampleBinding(sceneId: string): SceneClipBindingV1 {
  const normalized = normalizeSceneDocument(structuredClone(BASIC_EXPLAINER_SCENE));
  assert.equal(normalized.success, true);
  if (!normalized.success) throw new Error('normalize failed');
  const scene = { ...normalized.scene, id: sceneId };
  const sceneContentHash = computeSceneContentHash(scene);
  return withBindingPayloadHash({
    schemaVersion: '1.0.0',
    bindingMode: 'embedded-snapshot',
    sourceDraft: {
      draftId: 'draft.narration-plan',
      draftRevision: 1,
      historyEntryId: 'hist_np',
      sceneContentHash,
    },
    scene,
    sceneContentHash,
    dependencyFingerprint: 'dep-fp-np',
    catalogRevision: 'catalog-np',
    motionRuntimeRevision: 'motion-np',
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

export function sampleVideoPlan(): VideoPlanV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'video-plan.narration-example',
    name: 'Narration example',
    output: { width: 1280, height: 720, fps: 30, fit: 'contain' },
    placement: { mode: 'append', collisionPolicy: 'require-clear' },
    markers: { mode: 'boundary', defaultColor: 'blue', notePrefix: 'BCC' },
    defaults: { gapAfterFrames: 0, transitionToNext: { mode: 'cut' } },
    scenes: [
      {
        id: 'intro',
        binding: sampleBinding('scene.intro'),
        transitionToNext: { mode: 'timeline-transition', type: 'cross-dissolve', durationInFrames: 8 },
      },
      {
        id: 'body',
        binding: sampleBinding('scene.body'),
        duration: { mode: 'timeline-frames', timelineFrames: 60 },
      },
      {
        id: 'outro',
        binding: sampleBinding('scene.outro'),
      },
    ],
  };
}

export function sampleNarrationPlan(overrides: Partial<NarrationPlanV1> = {}): NarrationPlanV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'narration.hawking-radiation',
    name: 'Hawking radiation explainer',
    language: 'vi-VN',
    videoPlan: sampleVideoPlan(),
    speakers: [
      {
        id: 'narrator',
        name: 'Narrator',
        temporaryVoice: {
          provider: 'minimax',
          voiceId: 'female-tianmei',
          subtitleTiming: 'word',
        },
      },
    ],
    defaults: {
      speakerId: 'narrator',
      sceneDurationPolicy: 'fit-narration',
      captions: {
        enabled: true,
        template: 'black-bar',
        pacing: 'phrase',
        sourceMode: 'narration-items',
        export: { srt: true, vtt: true },
      },
    },
    scenes: [
      {
        sceneEntryId: 'intro',
        sceneDurationPolicy: 'fit-narration',
        segments: [
          { id: 'seg_intro_1', text: 'Bức xạ Hawking là hiện tượng lượng tử tại chân trời sự kiện.' },
        ],
      },
      {
        sceneEntryId: 'body',
        sceneDurationPolicy: 'at-least-visual',
        segments: [
          { id: 'seg_body_1', text: 'Các cặp hạt ảo xuất hiện gần chân trời.' },
          { id: 'seg_body_2', text: 'Một hạt rơi vào hố đen, hạt còn lại thoát ra ngoài.', captionText: 'Một hạt rơi vào; hạt kia thoát ra.' },
        ],
      },
      // outro intentionally has no narration
    ],
    ...overrides,
  };
}

const fixturesDir = join(process.cwd(), 'packages', 'narration-plans', 'src', 'fixtures');
mkdirSync(join(fixturesDir, 'valid'), { recursive: true });
mkdirSync(join(fixturesDir, 'invalid'), { recursive: true });
writeFileSync(join(fixturesDir, 'valid', 'three-scene.json'), JSON.stringify(sampleNarrationPlan(), null, 2));
writeFileSync(join(fixturesDir, 'invalid', 'bad-schema.json'), JSON.stringify({ schemaVersion: '9.0.0', id: 'x', name: 'x', language: 'en', speakers: [], scenes: [] }, null, 2));

// Normalization does not mutate input
{
  const raw = sampleNarrationPlan();
  const before = JSON.stringify(raw);
  const result = normalizeNarrationPlan(raw);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(JSON.stringify(raw), before);
}

// Hash stability
{
  const a = normalizeNarrationPlan(sampleNarrationPlan()).plan!;
  const b = normalizeNarrationPlan(sampleNarrationPlan()).plan!;
  assert.equal(computeNarrationPlanHash(a), computeNarrationPlanHash(b));
  const rawReversed = sampleNarrationPlan();
  rawReversed.scenes = [...rawReversed.scenes].reverse();
  const normRev = normalizeNarrationPlan(rawReversed).plan!;
  assert.equal(computeNarrationPlanHash(a), computeNarrationPlanHash(normRev));
  const textChanged = normalizeNarrationPlan(sampleNarrationPlan({
    scenes: [
      {
        sceneEntryId: 'intro',
        segments: [{ id: 'seg_intro_1', text: 'Changed text for hash.' }],
      },
      {
        sceneEntryId: 'body',
        segments: [
          { id: 'seg_body_1', text: 'Các cặp hạt ảo xuất hiện gần chân trời.' },
          { id: 'seg_body_2', text: 'Một hạt rơi vào hố đen, hạt còn lại thoát ra ngoài.' },
        ],
      },
    ],
  })).plan!;
  assert.notEqual(computeNarrationPlanHash(a), computeNarrationPlanHash(textChanged));
}

// Validation
{
  const validated = validateNarrationPlan(sampleNarrationPlan());
  assert.equal(validated.valid, true, JSON.stringify(validated.errors));
  assert.ok(validated.narrationPlanHash);
  assert.equal(validated.narrationRuntimeRevision, computeNarrationRuntimeRevision());
  assert.equal(validated.normalizedPlan!.scenes.length, 2);
  assert.ok(validated.warnings.some((w) => w.message.includes('outro') || w.sceneEntryId === 'outro'));
}

// Invalid cases
{
  assert.equal(validateNarrationPlan({ ...sampleNarrationPlan(), schemaVersion: '2.0.0' }).valid, false);
  assert.equal(validateNarrationPlan({ ...sampleNarrationPlan(), id: 'BAD ID' }).valid, false);
  assert.equal(validateNarrationPlan({ ...sampleNarrationPlan(), language: '' }).valid, false);
  assert.equal(validateNarrationPlan({
    ...sampleNarrationPlan(),
    speakers: [{
      id: 'narrator',
      temporaryVoice: {
        provider: 'minimax',
        voiceId: 'x',
        apiKey: 'secret',
      } as never,
    }],
  }).valid, false);
}

// Estimated word timing
{
  const en = estimateWordTimings({ text: 'Hello, world!', durationMs: 1000, language: 'en' });
  assert.ok(en.length >= 2);
  assert.equal(en[0]!.start, 0);
  assert.ok(en[en.length - 1]!.end <= 1000);
  for (let i = 1; i < en.length; i += 1) {
    assert.ok(en[i]!.start >= en[i - 1]!.end);
    assert.ok(en[i]!.end > en[i]!.start);
  }
  const vi = estimateWordTimings({ text: 'Xin chào Việt Nam đấy', durationMs: 1200, language: 'vi-VN' });
  assert.ok(vi.length >= 3);
  const a = estimateWordTimings({ text: 'Same input', durationMs: 500, language: 'en' });
  const b = estimateWordTimings({ text: 'Same input', durationMs: 500, language: 'en' });
  assert.deepEqual(a, b);
  const cjk = estimateWordTimings({ text: '量子效应', durationMs: 800, language: 'zh-CN' });
  assert.ok(cjk.length >= 2);
}

assert.ok(MAX_NARRATION_SEGMENTS >= 1000);
console.log('narration-plans.verify: ok');
