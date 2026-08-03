/**
 * Real Remotion still for thumbnail when available.
 * Use BETTER_CHAT_CUT_PUBLISHING_SKIP_THUMBNAIL_RENDER=1 to skip in constrained envs.
 */
import assert from 'node:assert/strict';
import {
  buildThumbnailScene,
  validateThumbnailPlan,
  type ThumbnailPlanV1,
} from './src/index.ts';
import { createScenePreviewService } from '../scene-graph/src/preview/scene-preview-service.ts';

if (process.env.BETTER_CHAT_CUT_PUBLISHING_SKIP_THUMBNAIL_RENDER === '1') {
  console.log('publishing-assets.render.verify.ts: skipped (BETTER_CHAT_CUT_PUBLISHING_SKIP_THUMBNAIL_RENDER=1)');
  process.exit(0);
}

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
  id: 'thumb.render',
  name: 'Render thumb',
  output: { width: 1280, height: 720, format: 'png' },
  source: { type: 'custom-scene', scene: scene as never },
  overlays: [{
    type: 'label',
    id: 'title',
    text: 'Render QA',
    box: { x: 100, y: 280, width: 1080, height: 120 },
    style: { fontSize: 64, textColor: '#FFFFFF', align: 'center' },
  }],
};

const v = validateThumbnailPlan(plan);
assert.equal(v.valid, true);
const built = buildThumbnailScene(v.normalized!);
const preview = createScenePreviewService();
const still = await preview.renderStill({
  scene: built,
  frame: 0,
  outputWidth: 1280,
  outputHeight: 720,
});
assert.ok(still.byteLength > 0);
assert.equal(still.width, 1280);
assert.equal(still.height, 720);
assert.equal(still.mimeType, 'image/png');
console.log('publishing-assets.render.verify.ts: ok');
