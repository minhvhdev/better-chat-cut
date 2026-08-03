import assert from 'node:assert/strict';
import { mcpTools } from '../mcp.ts';
import { runSceneTool } from './scene-tools.ts';
import { BASIC_EXPLAINER_SCENE, GROUP_TRANSFORM_SCENE } from '../../../packages/scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

const skipRender = process.env.BCC_SKIP_SCENE_RENDER === '1' || process.argv.includes('--skip-render');
if (skipRender) process.env.BCC_SKIP_SCENE_RENDER = '1';

{
  const names = mcpTools().map((tool) => tool.name);
  for (const name of [
    'scene_get_contract',
    'scene_validate',
    'scene_evaluate_frame',
    'scene_render_preview',
    'motion_asset_inspect',
    'asset_search',
  ]) {
    assert.ok(names.includes(name), `missing ${name}`);
  }
}

{
  const invalid = await runSceneTool('scene_validate', {
    scene: { schemaVersion: '9.9.9', id: 'bad', name: 'x', nodes: [] },
  }) as { valid: boolean; errors: Array<{ code: string }> };
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length > 0);
}

{
  const ok = await runSceneTool('scene_validate', {
    scene: GROUP_TRANSFORM_SCENE,
    includeDependencies: true,
    analyzeLayout: true,
  }) as { valid: boolean; dependencyFingerprint?: string };
  assert.equal(ok.valid, true, JSON.stringify(ok));
  assert.ok(ok.dependencyFingerprint);
}

if (!skipRender) {
  const still = await runSceneTool('scene_render_preview', {
    scene: BASIC_EXPLAINER_SCENE,
    mode: 'still',
    frame: 15,
    outputWidth: 640,
  }) as {
    mimeType: string;
    cacheHit: boolean;
    cacheKey: string;
    width: number;
    height: number;
    __images?: Array<{ base64: string; mimeType: string }>;
  };
  assert.equal(still.mimeType, 'image/png');
  assert.ok(still.__images?.[0]?.base64);
  assert.ok(still.width > 0 && still.height > 0);

  const still2 = await runSceneTool('scene_render_preview', {
    scene: BASIC_EXPLAINER_SCENE,
    mode: 'still',
    frame: 15,
    outputWidth: 640,
  }) as { cacheHit: boolean; cacheKey: string };
  assert.equal(still2.cacheHit, true);
  assert.equal(still2.cacheKey, still.cacheKey);

  const sheet = await runSceneTool('scene_render_preview', {
    scene: GROUP_TRANSFORM_SCENE,
    mode: 'contact-sheet',
    columns: 3,
    cellWidth: 320,
  }) as {
    frames?: number[];
    __images?: Array<{ base64: string }>;
  };
  assert.ok(sheet.__images?.[0]?.base64);
  assert.ok((sheet.frames?.length ?? 0) >= 2);

  const mid = await runSceneTool('scene_render_preview', {
    scene: BASIC_EXPLAINER_SCENE,
    mode: 'still',
    frame: 45,
    outputWidth: 640,
  }) as { __images?: Array<{ base64: string }> };
  assert.notEqual(still.__images?.[0]?.base64, mid.__images?.[0]?.base64);
}

console.log(`scene-tools.verify: ok${skipRender ? ' (render skipped)' : ''}`);
