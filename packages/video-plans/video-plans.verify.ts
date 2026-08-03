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
import {
  createVideoPlanService,
  computeVideoPlanHash,
  computeVideoPlanRuntimeRevision,
  normalizeVideoPlan,
  validateVideoPlan,
  MAX_VIDEO_PLAN_SCENES,
  type VideoPlanV1,
  type SceneClipBindingV1,
} from './src/index.ts';

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
      draftId: 'draft.video-plan',
      draftRevision: 1,
      historyEntryId: 'hist_vp',
      sceneContentHash,
    },
    scene,
    sceneContentHash,
    dependencyFingerprint: 'dep-fp-vp',
    catalogRevision: 'catalog-vp',
    motionRuntimeRevision: 'motion-vp',
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

function threeScenePlan(overrides: Partial<VideoPlanV1> = {}): VideoPlanV1 {
  const b1 = sampleBinding('scene.intro');
  const b2 = sampleBinding('scene.body');
  const b3 = sampleBinding('scene.outro');
  return {
    schemaVersion: '1.0.0',
    id: 'video-plan.example-three-scene',
    name: 'Example three-scene plan',
    output: { width: 1280, height: 720, fps: 30, fit: 'contain' },
    sceneCanvasPolicy: 'require-match',
    placement: { mode: 'append', collisionPolicy: 'require-clear' },
    markers: { mode: 'boundary', defaultColor: 'blue', notePrefix: 'BCC Scene' },
    defaults: { gapAfterFrames: 0, transitionToNext: { mode: 'cut' } },
    scenes: [
      {
        id: 'intro',
        name: 'Intro',
        binding: b1,
        transitionToNext: { mode: 'timeline-transition', type: 'cross-dissolve', durationInFrames: 12 },
      },
      {
        id: 'body',
        name: 'Body',
        binding: b2,
        duration: { mode: 'timeline-frames', timelineFrames: 60 },
        transitionToNext: { mode: 'cut' },
      },
      {
        id: 'outro',
        name: 'Outro',
        binding: b3,
      },
    ],
    ...overrides,
  };
}

const fixturesDir = join(process.cwd(), 'packages', 'video-plans', 'src', 'fixtures');
mkdirSync(join(fixturesDir, 'valid'), { recursive: true });
mkdirSync(join(fixturesDir, 'invalid'), { recursive: true });
writeFileSync(join(fixturesDir, 'valid', 'three-scene.json'), JSON.stringify(threeScenePlan(), null, 2));
writeFileSync(join(fixturesDir, 'invalid', 'bad-schema.json'), JSON.stringify({ schemaVersion: '9.0.0', id: 'x', name: 'x', output: {}, scenes: [] }, null, 2));

// Normalization does not mutate input
{
  const raw = threeScenePlan();
  const before = JSON.stringify(raw);
  const result = normalizeVideoPlan(raw);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(raw), before);
}

// Hash stability / key order independence
{
  const a = normalizeVideoPlan(threeScenePlan()).plan!;
  const b = normalizeVideoPlan(threeScenePlan()).plan!;
  assert.equal(computeVideoPlanHash(a), computeVideoPlanHash(b));
  const reordered = {
    ...a,
    scenes: [...a.scenes].reverse(),
  };
  assert.notEqual(computeVideoPlanHash(a), computeVideoPlanHash(reordered));
}

// Validation + schedule
{
  const validated = validateVideoPlan(threeScenePlan());
  assert.equal(validated.valid, true, JSON.stringify(validated.errors));
  assert.ok(validated.planHash);
  assert.equal(validated.videoPlanRuntimeRevision, computeVideoPlanRuntimeRevision());
  assert.ok(validated.schedule);
  assert.equal(validated.schedule.entries.length, 3);
  assert.equal(validated.schedule.transitions.length, 1);
  assert.equal(validated.schedule.markers.length, 3);
  // durations: match-scene (~90), fixed 60, match-scene (~90) + gaps 0
  assert.equal(validated.schedule.entries[0]!.durationInFrames, 90);
  assert.equal(validated.schedule.entries[1]!.durationInFrames, 60);
  assert.equal(validated.schedule.entries[2]!.durationInFrames, 90);
  assert.equal(validated.schedule.totalDurationInFrames, 240);
  assert.equal(validated.schedule.transitions[0]!.relativeCutFrame, 90);
}

// Invalid cases
{
  assert.equal(validateVideoPlan({ ...threeScenePlan(), schemaVersion: '2.0.0' }).valid, false);
  assert.equal(validateVideoPlan({ ...threeScenePlan(), scenes: [] }).valid, false);
  assert.equal(validateVideoPlan({ ...threeScenePlan(), id: 'BAD ID' }).valid, false);
  const dup = threeScenePlan();
  dup.scenes[1]!.id = 'intro';
  assert.equal(validateVideoPlan(dup).valid, false);
  const lastTr = threeScenePlan();
  lastTr.scenes[2]!.transitionToNext = { mode: 'timeline-transition', type: 'cross-dissolve', durationInFrames: 10 };
  assert.equal(validateVideoPlan(lastTr).valid, false);
  const gapTr = threeScenePlan();
  gapTr.scenes[0]!.gapAfterFrames = 5;
  assert.equal(validateVideoPlan(gapTr).valid, false);
  const tooMany = threeScenePlan();
  tooMany.scenes = Array.from({ length: MAX_VIDEO_PLAN_SCENES + 1 }, (_, i) => ({
    id: `s${i}`,
    binding: sampleBinding(`scene.${i}`),
  }));
  assert.equal(validateVideoPlan(tooMany).valid, false);
  assert.equal(validateVideoPlan({ ...threeScenePlan(), output: { width: 10, height: 10, fps: 30 } }).valid, false);
  assert.equal(validateVideoPlan({ foo: () => 1 }).valid, false);
}

// Service
{
  const service = createVideoPlanService();
  const result = service.validate(threeScenePlan());
  assert.equal(result.valid, true);
  const schedule = service.createSchedule(result.normalizedPlan!);
  assert.equal(schedule.planId, 'video-plan.example-three-scene');
}

console.log('video-plans.verify: ok');
