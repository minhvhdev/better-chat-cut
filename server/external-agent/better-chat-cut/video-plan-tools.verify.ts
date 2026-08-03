import assert from 'node:assert/strict';
import {
  VIDEO_PLAN_CONTROL_TOOLS,
  VIDEO_PLAN_PROJECT_TOOLS,
  runVideoPlanControlTool,
} from './video-plan-tools.ts';
import {
  BASIC_EXPLAINER_SCENE,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  normalizeSceneDocument,
} from '../../../packages/scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';
import { withBindingPayloadHash } from '../../../packages/project-scene-bindings/src/index.ts';

ensureBetterChatCutMotionRuntime();

assert.deepEqual(
  VIDEO_PLAN_CONTROL_TOOLS.map((tool) => tool.name),
  ['video_plan_get_contract', 'video_plan_validate'],
);
assert.deepEqual(
  VIDEO_PLAN_PROJECT_TOOLS.map((tool) => tool.name),
  [
    'video_plan_preview_assembly',
    'video_plan_assemble',
    'video_plan_inspect_assembly',
    'video_plan_validate_render',
  ],
);

const contract = await runVideoPlanControlTool('video_plan_get_contract', { format: 'full' }) as {
  limitations: string[];
  workflow: string[];
};
assert.ok(contract.workflow.includes('video_plan_assemble'));
assert.ok(contract.limitations.some((line) => line.includes('narration')));

const normalized = normalizeSceneDocument(structuredClone(BASIC_EXPLAINER_SCENE));
assert.equal(normalized.success, true);
if (!normalized.success) throw new Error('normalize failed');
const scene = normalized.scene;
const sceneContentHash = computeSceneContentHash(scene);
const binding = withBindingPayloadHash({
  schemaVersion: '1.0.0',
  bindingMode: 'embedded-snapshot',
  sourceDraft: {
    draftId: 'draft.tools',
    draftRevision: 1,
    historyEntryId: 'hist_tools',
    sceneContentHash,
  },
  scene,
  sceneContentHash,
  dependencyFingerprint: 'dep-fp-tools',
  catalogRevision: 'catalog-tools',
  motionRuntimeRevision: 'motion-tools',
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

const plan = {
  schemaVersion: '1.0.0',
  id: 'video-plan.tools-verify',
  name: 'Tools verify',
  output: { width: 1280, height: 720, fps: 30, fit: 'contain' },
  scenes: [
    { id: 'only', binding },
  ],
};

const validated = await runVideoPlanControlTool('video_plan_validate', {
  plan,
  includeSchedule: true,
}) as { valid: boolean; schedule?: { totalDurationInFrames: number } };
assert.equal(validated.valid, true);
assert.equal(validated.schedule?.totalDurationInFrames, 90);

if (!process.argv.includes('--skip-render')) {
  // Control tools do not render; render coverage lives in project-video-assembly.render.verify.
}

console.log(`video-plan-tools.verify: ok${process.argv.includes('--skip-render') ? ' (render skipped)' : ''}`);
