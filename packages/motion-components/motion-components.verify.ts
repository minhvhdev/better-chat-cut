import assert from 'node:assert/strict';
import {
  computeRuntimeRevision,
  ensureBetterChatCutMotionRuntime,
  getMotionComponent,
  listMotionAnimations,
  listMotionComponents,
  listMotionThemes,
  validateMotionProps,
} from './src/index.ts';
import { mcpTools } from '../../server/external-agent/mcp.ts';
import { runMotionTool } from '../../server/external-agent/better-chat-cut/motion-tools.ts';

ensureBetterChatCutMotionRuntime();

{
  assert.ok(listMotionComponents().length >= 6);
  assert.ok(listMotionAnimations().length >= 5);
  assert.ok(listMotionThemes().length >= 2);
  assert.ok(getMotionComponent('primitive.circle', '1.0.0'));
  assert.ok(computeRuntimeRevision().startsWith('runtime-'));
}

{
  const circle = getMotionComponent('primitive.circle')!;
  const ok = validateMotionProps(circle.propsSchema, { radius: 40 }, circle.defaultProps);
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedProps.radius, 40);
  const bad = validateMotionProps(circle.propsSchema, { radius: 'big' as never }, circle.defaultProps);
  assert.equal(bad.valid, false);
}

{
  const names = mcpTools().map((tool) => tool.name);
  for (const name of ['motion_asset_inspect', 'motion_asset_validate_props', 'motion_asset_render_preview']) {
    assert.ok(names.includes(name), `${name} missing from MCP tools`);
  }
}

{
  const inspected = await runMotionTool('motion_asset_inspect', { assetId: 'primitive.circle' }) as {
    asset: { runtimeAvailable: boolean; id: string } | null;
  };
  assert.ok(inspected.asset);
  assert.equal(inspected.asset.runtimeAvailable, true);

  const validated = await runMotionTool('motion_asset_validate_props', {
    assetId: 'primitive.circle',
    props: { radius: 50 },
  }) as { valid: boolean; normalizedProps: { radius: number } };
  assert.equal(validated.valid, true);
  assert.equal(validated.normalizedProps.radius, 50);
}

// Keep default verify fast; full Remotion chrome render is opt-in.
process.env.BCC_SKIP_MOTION_RENDER = '1';
{
  const preview = await runMotionTool('motion_asset_render_preview', {
    assetId: 'primitive.circle',
    mode: 'still',
  }) as { skipped?: boolean };
  assert.equal(preview.skipped, true);
}

console.log('motion-components.verify: ok');
