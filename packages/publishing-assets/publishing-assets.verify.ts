import assert from 'node:assert/strict';
import {
  buildThumbnailScene,
  evaluateThumbnailQa,
  validateThumbnailPlan,
  type ThumbnailPlanV1,
} from './src/index.ts';

const scene = {
  schemaVersion: '1.0.0' as const,
  id: 'scene.basic-explainer',
  name: 'Basic',
  canvas: { width: 1280, height: 720, backgroundColor: '#0D1021' },
  fps: 30,
  durationInFrames: 90,
  theme: { id: 'default', version: '1.0.0' },
  nodes: [{
    id: 'node_bg',
    type: 'asset' as const,
    order: 0,
    startFrame: 0,
    endFrame: 90,
    layout: { x: 0, y: 0, width: 1280, height: 720 },
    asset: { id: 'background.solid', version: '1.0.0', props: { color: '#0D1021' } },
  }],
};

const plan: ThumbnailPlanV1 = {
  schemaVersion: '1.0.0',
  id: 'thumb.assets',
  name: 'Assets thumb',
  output: { width: 1280, height: 720, format: 'png' },
  source: { type: 'custom-scene', scene: scene as never },
  overlays: [
    {
      type: 'shape',
      id: 'bar',
      shape: 'rectangle',
      box: { x: 40, y: 500, width: 400, height: 120 },
      fill: '#E85D04',
    },
    {
      type: 'label',
      id: 'title',
      text: 'Explainer',
      box: { x: 60, y: 520, width: 360, height: 80 },
      style: { fontSize: 42, textColor: '#FFFFFF', align: 'center' },
    },
  ],
  safeArea: { top: 40, right: 40, bottom: 40, left: 40 },
};

const validated = validateThumbnailPlan(plan);
assert.equal(validated.valid, true, JSON.stringify(validated.errors));
const built = buildThumbnailScene(validated.normalized!);
assert.ok(built.nodes.length >= 3);
const qa = evaluateThumbnailQa({
  width: 1280,
  height: 720,
  expectedWidth: 1280,
  expectedHeight: 720,
  byteLength: 2048,
  overlays: plan.overlays!.map((o) => o.type === 'label'
    ? { id: o.id, type: 'label', text: o.text, fontSize: o.style.fontSize, box: o.box }
    : { id: o.id, type: 'shape', box: o.box }),
  safeArea: plan.safeArea,
});
assert.equal(qa.valid, true);
console.log('publishing-assets.verify.ts: ok');
