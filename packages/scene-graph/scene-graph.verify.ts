import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASIC_EXPLAINER_SCENE,
  GROUP_TRANSFORM_SCENE,
  NESTED_GROUP_SCENE,
  normalizeSceneDocument,
  computeSceneContentHash,
  computeSceneRuntimeRevision,
  createSceneValidator,
  createSceneFrameEvaluator,
  identityMatrix,
  multiplyMatrices,
  translationMatrix,
  rotationMatrix,
  scaleMatrix,
  buildNodeLocalMatrix,
  worldAabb,
  SCENE_LIMITS,
  stableStringify,
} from './src/index.ts';
import {
  INVALID_DUPLICATE_NODE_ID,
  INVALID_MISSING_PARENT,
  INVALID_UNKNOWN_FIELD,
} from './src/fixtures/invalid/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
import { mcpTools } from '../../server/external-agent/mcp.ts';
import { runSceneTool } from '../../server/external-agent/better-chat-cut/scene-tools.ts';

ensureBetterChatCutMotionRuntime();

function assertDeterminismGuard(root: string) {
  const banned = [
    'Math.random(',
    'Date.now(',
    'new Date(',
    'performance.now(',
    'setTimeout(',
    'setInterval(',
    'requestAnimationFrame(',
    'eval(',
    'new Function(',
    'dangerouslySetInnerHTML',
  ];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        for (const token of banned) {
          assert.equal(text.includes(token), false, `${path} contains banned token ${token}`);
        }
      }
    }
  };
  walk(root);
}

{
  assertDeterminismGuard(join(process.cwd(), 'packages/scene-graph/src/runtime'));
  assertDeterminismGuard(join(process.cwd(), 'packages/scene-graph/src/geometry'));
  assertDeterminismGuard(join(process.cwd(), 'packages/scene-graph/src/preview'));
  for (const file of [
    'remotion/better-chat-cut/BetterChatCutSceneStill.tsx',
    'remotion/better-chat-cut/BetterChatCutSceneContactSheet.tsx',
  ]) {
    const text = readFileSync(join(process.cwd(), file), 'utf8');
    assert.equal(text.includes('Math.random('), false);
  }
}

{
  const a = normalizeSceneDocument(BASIC_EXPLAINER_SCENE);
  assert.equal(a.success, true);
  if (!a.success) throw new Error('expected success');
  const clone = structuredClone(BASIC_EXPLAINER_SCENE);
  const before = stableStringify(clone);
  normalizeSceneDocument(clone);
  assert.equal(stableStringify(clone), before, 'normalize must not mutate input');

  const shuffled = {
    ...BASIC_EXPLAINER_SCENE,
    nodes: [...BASIC_EXPLAINER_SCENE.nodes].reverse(),
  };
  const b = normalizeSceneDocument(shuffled);
  assert.equal(b.success, true);
  if (!b.success) throw new Error('expected success');
  assert.equal(computeSceneContentHash(a.scene), computeSceneContentHash(b.scene));

  const propsOrder = structuredClone(BASIC_EXPLAINER_SCENE);
  const label = propsOrder.nodes.find((n) => n.id === 'label');
  assert.ok(label && label.type === 'asset');
  if (label.type === 'asset') {
    label.asset.props = { fontSize: 42, text: 'Hawking radiation' };
  }
  const c = normalizeSceneDocument(propsOrder);
  assert.equal(c.success, true);
  if (!c.success) throw new Error('expected success');
  assert.equal(computeSceneContentHash(a.scene), computeSceneContentHash(c.scene));
}

{
  const bad = normalizeSceneDocument(INVALID_UNKNOWN_FIELD);
  assert.equal(bad.success, false);
  const unicode = normalizeSceneDocument({
    ...BASIC_EXPLAINER_SCENE,
    name: 'Giới thiệu bức xạ Hawking',
    description: 'Nhãn tiếng Việt giữ nguyên dấu',
  });
  assert.equal(unicode.success, true);
  if (unicode.success) {
    assert.equal(unicode.scene.name, 'Giới thiệu bức xạ Hawking');
    assert.match(unicode.scene.description ?? '', /tiếng Việt/);
  }
}

{
  const validator = createSceneValidator();
  const ok = await validator.validate(BASIC_EXPLAINER_SCENE, {
    includeNormalizedScene: true,
    analyzeLayout: true,
  });
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  assert.ok(ok.sceneContentHash);
  assert.ok(ok.dependencyFingerprint);
  assert.ok(ok.sceneRuntimeRevision.startsWith('scene-runtime-'));

  const dup = await validator.validate(INVALID_DUPLICATE_NODE_ID);
  assert.equal(dup.valid, false);
  assert.ok(dup.errors.some((e) => e.code === 'SCENE_DUPLICATE_NODE_ID'));

  const missingParent = await validator.validate(INVALID_MISSING_PARENT);
  assert.equal(missingParent.valid, false);
  assert.ok(missingParent.errors.some((e) => e.code === 'SCENE_PARENT_NOT_FOUND'));
}

{
  const I = identityMatrix();
  const T = translationMatrix(10, 20);
  const S = scaleMatrix(2, 3);
  const R = rotationMatrix(90);
  const M = multiplyMatrices(T, multiplyMatrices(R, S));
  assert.ok(Number.isFinite(M.a));
  const local = buildNodeLocalMatrix({
    layoutX: 100,
    layoutY: 50,
    layoutWidth: 200,
    layoutHeight: 100,
    transform: { rotation: 45, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
  });
  const box = worldAabb(local, { x: 0, y: 0, width: 200, height: 100 });
  assert.ok(box.width > 0 && box.height > 0);
  assert.deepEqual(I, identityMatrix());
}

{
  const evaluator = createSceneFrameEvaluator();
  const group = normalizeSceneDocument(GROUP_TRANSFORM_SCENE);
  assert.equal(group.success, true);
  if (!group.success) throw new Error('expected group scene');
  const frame0 = await evaluator.evaluate(group.scene, 0);
  const frame8 = await evaluator.evaluate(group.scene, 8);
  const child0 = frame0.nodes.find((n) => n.id === 'childCircle')!;
  const child8 = frame8.nodes.find((n) => n.id === 'childCircle')!;
  assert.equal(child0.active, true);
  assert.ok(child0.worldMatrix);
  // float animation changes translateY over time (avoid period zeros at 0/15/30)
  assert.notEqual(child0.worldMatrix.f, child8.worldMatrix.f);

  const nested = normalizeSceneDocument(NESTED_GROUP_SCENE);
  assert.equal(nested.success, true);
  if (!nested.success) throw new Error('expected nested');
  const nestedEval = await evaluator.evaluate(nested.scene, 10);
  const dot = nestedEval.nodes.find((n) => n.id === 'dot')!;
  assert.equal(dot.active, true);
  assert.ok(dot.worldBounds.width > 0);
}

{
  assert.ok(SCENE_LIMITS.MAX_NODES === 200);
  assert.ok(computeSceneRuntimeRevision().startsWith('scene-runtime-'));
}

{
  const names = mcpTools().map((tool) => tool.name);
  for (const name of [
    'scene_get_contract',
    'scene_validate',
    'scene_evaluate_frame',
    'scene_render_preview',
  ]) {
    assert.ok(names.includes(name), `missing ${name}`);
  }

  const contract = await runSceneTool('scene_get_contract', { format: 'summary' }) as {
    exampleScene: { id: string };
    limits: { MAX_NODES: number };
  };
  assert.equal(contract.exampleScene.id, 'scene.basic-explainer');
  assert.equal(contract.limits.MAX_NODES, 200);

  const validated = await runSceneTool('scene_validate', {
    scene: BASIC_EXPLAINER_SCENE,
    analyzeLayout: false,
  }) as { valid: boolean; sceneContentHash: string };
  assert.equal(validated.valid, true);
  assert.ok(validated.sceneContentHash);

  const evaluated = await runSceneTool('scene_evaluate_frame', {
    scene: BASIC_EXPLAINER_SCENE,
    frame: 20,
  }) as { nodes: unknown[] };
  assert.ok(evaluated.nodes.length > 0);
}

process.env.BCC_SKIP_SCENE_RENDER = '1';
{
  const preview = await runSceneTool('scene_render_preview', {
    scene: BASIC_EXPLAINER_SCENE,
    mode: 'still',
    frame: 10,
  }) as { skipped?: boolean };
  assert.equal(preview.skipped, true);
}

console.log('scene-graph.verify: ok');
