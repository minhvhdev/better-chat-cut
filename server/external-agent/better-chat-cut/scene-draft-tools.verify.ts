import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcpTools } from '../mcp.ts';
import { BASIC_EXPLAINER_SCENE } from '../../../packages/scene-graph/src/index.ts';
import { runSceneDraftTool, resetSceneDraftServiceForTests } from './scene-draft-tools.ts';
import { runAssetResolverTool } from './asset-resolver-tools.ts';
import { runSceneTool } from './scene-tools.ts';

const skipRender = process.argv.includes('--skip-render');
const tempRoot = mkdtempSync(join(tmpdir(), 'bcc-scene-draft-tools-'));
process.env.BETTER_CHAT_CUT_SCENE_DRAFT_ROOT = tempRoot;
await resetSceneDraftServiceForTests(tempRoot);

const names = mcpTools().map((tool) => tool.name);
for (const name of [
  'scene_draft_get_contract',
  'scene_draft_list',
  'scene_draft_get',
  'scene_draft_create',
  'scene_draft_compose_asset_plan',
  'scene_draft_patch',
  'scene_draft_undo',
  'scene_draft_redo',
  'scene_draft_validate',
  'scene_draft_render_preview',
  'asset_resolve_batch',
  'scene_get_contract',
]) {
  assert.ok(names.includes(name), `missing ${name}`);
}

{
  const contract = await runSceneDraftTool('scene_draft_get_contract', { format: 'full' }) as {
    schemaVersion: string;
    examples: unknown;
  };
  assert.equal(contract.schemaVersion, '1.0.0');
  assert.ok(contract.examples);

  const dry = await runSceneDraftTool('scene_draft_create', {
    requestId: 'mcp-create-dry',
    draftId: 'scene-draft.mcp-demo',
    name: 'MCP demo',
    scene: BASIC_EXPLAINER_SCENE,
  }) as { dryRun: boolean };
  assert.equal(dry.dryRun, true);

  const created = await runSceneDraftTool('scene_draft_create', {
    requestId: 'mcp-create',
    draftId: 'scene-draft.mcp-demo',
    name: 'MCP demo',
    scene: BASIC_EXPLAINER_SCENE,
    dryRun: false,
  }) as { dryRun: boolean; draft: { revision: number; sceneContentHash: string }; resultingRevision: number };
  assert.equal(created.dryRun, false);
  assert.equal(created.resultingRevision, 1);

  const got = await runSceneDraftTool('scene_draft_get', { draftId: 'scene-draft.mcp-demo' }) as {
    draft: { summary: { revision: number; sceneContentHash: string } } | null;
  };
  assert.ok(got.draft);

  const missing = await runSceneDraftTool('scene_draft_get', { draftId: 'scene-draft.missing' }) as {
    draft: null;
  };
  assert.equal(missing.draft, null);

  const patchDry = await runSceneDraftTool('scene_draft_patch', {
    requestId: 'mcp-patch-dry',
    draftId: 'scene-draft.mcp-demo',
    expectedRevision: got.draft!.summary.revision,
    expectedSceneContentHash: got.draft!.summary.sceneContentHash,
    patch: {
      schemaVersion: '1.0.0',
      id: 'mcp-patch',
      operations: [{ type: 'scene.set_metadata', operationId: 'm1', name: 'Patched' }],
    },
    includePredictedScene: true,
  }) as { dryRun: true; predictedSceneContentHash: string };
  assert.equal(patchDry.dryRun, true);

  const patched = await runSceneDraftTool('scene_draft_patch', {
    requestId: 'mcp-patch',
    draftId: 'scene-draft.mcp-demo',
    expectedRevision: got.draft!.summary.revision,
    expectedSceneContentHash: got.draft!.summary.sceneContentHash,
    patch: {
      schemaVersion: '1.0.0',
      id: 'mcp-patch',
      operations: [{ type: 'scene.set_metadata', operationId: 'm1', name: 'Patched' }],
    },
    dryRun: false,
  }) as { dryRun: false; resultingRevision: number; resultingSceneContentHash: string };
  assert.equal(patched.dryRun, false);

  const undoDry = await runSceneDraftTool('scene_draft_undo', {
    requestId: 'mcp-undo-dry',
    draftId: 'scene-draft.mcp-demo',
    expectedRevision: patched.resultingRevision,
    expectedSceneContentHash: patched.resultingSceneContentHash,
  }) as { dryRun: true };
  assert.equal(undoDry.dryRun, true);

  const undone = await runSceneDraftTool('scene_draft_undo', {
    requestId: 'mcp-undo',
    draftId: 'scene-draft.mcp-demo',
    expectedRevision: patched.resultingRevision,
    expectedSceneContentHash: patched.resultingSceneContentHash,
    dryRun: false,
  }) as { dryRun: false; resultingRevision: number; resultingSceneContentHash: string };
  assert.equal(undone.dryRun, false);

  const redone = await runSceneDraftTool('scene_draft_redo', {
    requestId: 'mcp-redo',
    draftId: 'scene-draft.mcp-demo',
    expectedRevision: undone.resultingRevision,
    expectedSceneContentHash: undone.resultingSceneContentHash,
    dryRun: false,
  }) as { dryRun: false };
  assert.equal(redone.dryRun, false);

  const validated = await runSceneDraftTool('scene_draft_validate', {
    draftId: 'scene-draft.mcp-demo',
  }) as { valid: boolean };
  assert.equal(validated.valid, true);

  const listed = await runSceneDraftTool('scene_draft_list', { limit: 5 }) as {
    total: number;
    items: unknown[];
  };
  assert.ok(listed.total >= 1);

  if (!skipRender) {
    const preview = await runSceneDraftTool('scene_draft_render_preview', {
      draftId: 'scene-draft.mcp-demo',
      mode: 'still',
      frame: 0,
      outputWidth: 640,
    }) as { mimeType: string; __images?: Array<{ mimeType: string; base64: string }> };
    assert.equal(preview.mimeType, 'image/png');
    assert.ok(preview.__images?.[0]?.base64);
  }

  assert.equal(JSON.stringify(created).includes('C:\\\\'), false);
}

// Prior tools still work
{
  const resolver = await runAssetResolverTool('asset_resolver_get_contract', { format: 'summary' });
  assert.ok(resolver);
  const scene = await runSceneTool('scene_get_contract', { format: 'summary' });
  assert.ok(scene);
}

rmSync(tempRoot, { recursive: true, force: true });
console.log(`scene-draft-tools.verify: ok${skipRender ? ' (render skipped)' : ''}`);
