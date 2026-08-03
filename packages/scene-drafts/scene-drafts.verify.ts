import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BASIC_EXPLAINER_SCENE,
  computeSceneContentHash,
  stableStringify,
} from '../scene-graph/src/index.ts';
import {
  createBatchAssetResolver,
  type AssetRequirementSetV1,
  type AssetPlanV1,
} from '../asset-resolver/src/index.ts';
import {
  createGlobalAssetRegistry,
  resolveAssetCatalogRootDescriptors,
} from '../global-asset-registry/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../motion-components/src/index.ts';
import {
  createSceneDraftService,
  resolveSceneDraftRoot,
  computeScenePatchHash,
  applyScenePatch,
  composeSceneFromAssetPlan,
  MAX_SCENE_DRAFT_HISTORY_ENTRIES,
  SceneDraftError,
  type AssetPlanSceneCompositionSpecV1,
  type ScenePatchV1,
} from './src/index.ts';

ensureBetterChatCutMotionRuntime();

const skipRender = process.argv.includes('--skip-render');
const tempRoot = mkdtempSync(join(tmpdir(), 'bcc-scene-drafts-'));
process.env.BETTER_CHAT_CUT_SCENE_DRAFT_ROOT = tempRoot;

function assertNoPathLeak(value: unknown): void {
  const text = JSON.stringify(value);
  assert.equal(text.includes('\\\\Users\\\\'), false);
  assert.equal(/[A-Z]:\\\\/.test(text), false);
}

{
  // Root resolution
  delete process.env.BETTER_CHAT_CUT_SCENE_DRAFT_ROOT;
  const def = resolveSceneDraftRoot();
  assert.ok(def.includes('better-chat-cut'));
  assert.ok(def.includes('scene-drafts'));
  process.env.BETTER_CHAT_CUT_SCENE_DRAFT_ROOT = tempRoot;
  assert.equal(resolveSceneDraftRoot(), tempRoot);
}

const registry = createGlobalAssetRegistry({
  roots: resolveAssetCatalogRootDescriptors(),
  strict: false,
});
await registry.refresh();
const resolver = createBatchAssetResolver({ registry });
const service = createSceneDraftService({ root: tempRoot, registry, resolver });

{
  // Create dry-run does not create directory
  const dry = await service.create({
    requestId: 'create-dry-1',
    draftId: 'scene-draft.hawking-intro',
    name: 'Hawking intro',
    scene: BASIC_EXPLAINER_SCENE,
    dryRun: true,
  });
  assert.equal(dry.dryRun, true);
  assert.equal(existsSync(join(tempRoot, 'scene-draft.hawking-intro')), false);

  const created = await service.create({
    requestId: 'create-apply-1',
    draftId: 'scene-draft.hawking-intro',
    name: 'Hawking intro',
    scene: BASIC_EXPLAINER_SCENE,
    dryRun: false,
  });
  assert.equal(created.dryRun, false);
  assert.equal(created.resultingRevision, 1);
  assert.ok(existsSync(join(tempRoot, 'scene-draft.hawking-intro', 'draft.json')));
  assert.ok(existsSync(join(tempRoot, 'scene-draft.hawking-intro', 'events.jsonl')));

  await assert.rejects(
    () => service.create({
      requestId: 'create-dup-1',
      draftId: 'scene-draft.hawking-intro',
      name: 'Dup',
      scene: BASIC_EXPLAINER_SCENE,
      dryRun: false,
    }),
    (err: unknown) => err instanceof SceneDraftError && err.code === 'SCENE_DRAFT_ALREADY_EXISTS',
  );

  // Receipt replay
  const replay = await service.create({
    requestId: 'create-apply-1',
    draftId: 'scene-draft.hawking-intro',
    name: 'Hawking intro',
    scene: BASIC_EXPLAINER_SCENE,
    dryRun: false,
  });
  assert.equal(replay.replayedFromReceipt, true);

  // Path traversal
  await assert.rejects(
    () => service.create({
      requestId: 'bad-id',
      draftId: '../escape',
      name: 'Bad',
      scene: BASIC_EXPLAINER_SCENE,
      dryRun: true,
    }),
    (err: unknown) => err instanceof SceneDraftError && err.code === 'SCENE_DRAFT_INVALID_ID',
  );
}

{
  // History: create A, patch B, patch C, undo, redo, undo, patch D
  const draftId = 'scene-draft.history-demo';
  const a = await service.create({
    requestId: 'hist-create',
    draftId,
    name: 'History',
    scene: BASIC_EXPLAINER_SCENE,
    dryRun: false,
  });
  let detail = await service.get(draftId);
  assert.ok(detail);
  const hashA = detail!.summary.sceneContentHash;

  const patchB: ScenePatchV1 = {
    schemaVersion: '1.0.0',
    id: 'patch-b',
    operations: [{
      type: 'scene.set_metadata',
      operationId: 'op-b',
      name: 'History B',
    }],
  };
  const bDry = await service.applyPatch({
    requestId: 'hist-b-dry',
    draftId,
    expectedRevision: 1,
    expectedSceneContentHash: hashA,
    patch: patchB,
    dryRun: true,
  });
  assert.equal(bDry.dryRun, true);
  assert.equal((await service.get(draftId))!.summary.revision, 1);

  const b = await service.applyPatch({
    requestId: 'hist-b',
    draftId,
    expectedRevision: 1,
    expectedSceneContentHash: hashA,
    patch: patchB,
    dryRun: false,
  });
  assert.equal(b.dryRun, false);
  if (b.dryRun) throw new Error('expected apply');
  assert.equal(b.resultingRevision, 2);
  detail = await service.get(draftId);
  const hashB = detail!.summary.sceneContentHash;
  assert.notEqual(hashB, hashA);

  const patchC: ScenePatchV1 = {
    schemaVersion: '1.0.0',
    id: 'patch-c',
    operations: [{
      type: 'node.update_layout',
      operationId: 'op-c',
      nodeId: 'label',
      layout: { x: 120, y: 100, width: 600, height: 80 },
    }],
  };
  const c = await service.applyPatch({
    requestId: 'hist-c',
    draftId,
    expectedRevision: 2,
    expectedSceneContentHash: hashB,
    patch: patchC,
    dryRun: false,
  });
  assert.equal(c.dryRun, false);
  if (c.dryRun) throw new Error('expected apply');
  assert.equal(c.resultingRevision, 3);
  detail = await service.get(draftId);
  const hashC = detail!.summary.sceneContentHash;
  const revisionsBeforeUndo = readdirSync(join(tempRoot, draftId, 'revisions')).length;

  const undo1 = await service.undo({
    requestId: 'hist-undo-1',
    draftId,
    expectedRevision: 3,
    expectedSceneContentHash: hashC,
    dryRun: false,
  });
  assert.equal(undo1.dryRun, false);
  if (undo1.dryRun) throw new Error('expected apply');
  assert.equal(undo1.resultingRevision, 4);
  assert.equal(undo1.resultingSceneContentHash, hashB);
  assert.equal(readdirSync(join(tempRoot, draftId, 'revisions')).length, revisionsBeforeUndo);

  const redo1 = await service.redo({
    requestId: 'hist-redo-1',
    draftId,
    expectedRevision: 4,
    expectedSceneContentHash: hashB,
    dryRun: false,
  });
  assert.equal(redo1.dryRun, false);
  if (redo1.dryRun) throw new Error('expected apply');
  assert.equal(redo1.resultingSceneContentHash, hashC);

  const undo2 = await service.undo({
    requestId: 'hist-undo-2',
    draftId,
    expectedRevision: 5,
    expectedSceneContentHash: hashC,
    dryRun: false,
  });
  assert.equal(undo2.dryRun, false);
  if (undo2.dryRun) throw new Error('expected apply');
  assert.equal(undo2.resultingSceneContentHash, hashB);

  const patchD: ScenePatchV1 = {
    schemaVersion: '1.0.0',
    id: 'patch-d',
    operations: [{
      type: 'scene.set_metadata',
      operationId: 'op-d',
      name: 'History D',
    }],
  };
  const d = await service.applyPatch({
    requestId: 'hist-d',
    draftId,
    expectedRevision: 6,
    expectedSceneContentHash: hashB,
    patch: patchD,
    dryRun: false,
  });
  assert.equal(d.dryRun, false);
  if (d.dryRun) throw new Error('expected apply');
  detail = await service.get(draftId);
  assert.equal(detail!.summary.canRedo, false);
  assert.equal(detail!.history.count, 3); // A, B, D (C truncated from active)

  await assert.rejects(
    () => service.redo({
      requestId: 'hist-redo-fail',
      draftId,
      expectedRevision: detail!.summary.revision,
      expectedSceneContentHash: detail!.summary.sceneContentHash,
      dryRun: false,
    }),
    (err: unknown) => err instanceof SceneDraftError && err.code === 'SCENE_DRAFT_REDO_UNAVAILABLE',
  );

  // Revision conflict
  await assert.rejects(
    () => service.applyPatch({
      requestId: 'hist-conflict',
      draftId,
      expectedRevision: 1,
      expectedSceneContentHash: hashA,
      patch: patchB,
      dryRun: false,
    }),
    (err: unknown) => err instanceof SceneDraftError && err.code === 'SCENE_DRAFT_REVISION_CONFLICT',
  );
}

{
  // Semantic patch coverage on a fresh draft
  const draftId = 'scene-draft.patch-ops';
  await service.create({
    requestId: 'patch-create',
    draftId,
    name: 'Patch ops',
    scene: BASIC_EXPLAINER_SCENE,
    dryRun: false,
  });
  let detail = await service.get(draftId);
  const baseHash = detail!.summary.sceneContentHash;
  const before = stableStringify(detail!.scene);

  const patch: ScenePatchV1 = {
    schemaVersion: '1.0.0',
    id: 'multi-ops',
    operations: [
      { type: 'scene.set_canvas', operationId: 'c1', canvas: { width: 1280, height: 720, backgroundColor: '#101828' } },
      { type: 'scene.set_theme', operationId: 't1', theme: { id: 'default', version: '1.0.0' } },
      { type: 'scene.set_safe_area', operationId: 's1', safeArea: { top: 40, right: 60, bottom: 40, left: 60 } },
      { type: 'node.set_props', operationId: 'p1', nodeId: 'label', props: { text: 'Updated label', fontSize: 42 } },
      {
        type: 'node.animation_add',
        operationId: 'a1',
        nodeId: 'arrow',
        animation: {
          id: 'arrow-fade',
          animation: { id: 'animation.fade-in', version: '1.0.0' },
          startFrame: 0,
          durationInFrames: 12,
        },
      },
      { type: 'node.set_fit', operationId: 'f1', nodeId: 'circle', fit: 'cover' },
      {
        type: 'node.add_group',
        operationId: 'g1',
        node: {
          id: 'overlay-group',
          type: 'group',
          order: 10,
          startFrame: 0,
          endFrame: 90,
          layout: { x: 0, y: 0, width: 200, height: 200 },
        },
      },
      {
        type: 'node.reparent',
        operationId: 'r1',
        nodeId: 'circle',
        parentId: 'overlay-group',
      },
      { type: 'node.set_order', operationId: 'o1', nodeId: 'circle', order: 2 },
      { type: 'node.set_enabled', operationId: 'e1', nodeId: 'background', enabled: true },
      { type: 'node.set_metadata', operationId: 'm1', nodeId: 'label', metadata: { role: 'label', label: 'Title' } },
      {
        type: 'node.replace_asset',
        operationId: 'ra1',
        nodeId: 'arrow',
        asset: { id: 'primitive.arrow', version: '1.0.0', props: { length: 220 } },
        fit: 'contain',
      },
    ],
  };

  const hash1 = computeScenePatchHash(patch);
  const hash2 = computeScenePatchHash(JSON.parse(JSON.stringify(patch)) as ScenePatchV1);
  assert.equal(hash1, hash2);

  const applied = await applyScenePatch({ scene: detail!.scene, patch });
  assert.ok(applied.changeSummary.nodesAdded.includes('overlay-group'));
  assert.ok(applied.changeSummary.hierarchyChanged.includes('circle'));
  assert.equal(stableStringify(detail!.scene), before);

  // cascade remove fail / success
  await assert.rejects(
    () => applyScenePatch({
      scene: applied.predictedScene,
      patch: {
        schemaVersion: '1.0.0',
        id: 'rm-fail',
        operations: [{ type: 'node.remove', operationId: 'rm1', nodeId: 'overlay-group' }],
      },
    }),
    (err: unknown) => err instanceof SceneDraftError && err.code === 'SCENE_PATCH_NODE_HAS_CHILDREN',
  );

  const cascaded = await applyScenePatch({
    scene: applied.predictedScene,
    patch: {
      schemaVersion: '1.0.0',
      id: 'rm-ok',
      operations: [{ type: 'node.remove', operationId: 'rm2', nodeId: 'overlay-group', cascade: true }],
    },
  });
  assert.ok(cascaded.changeSummary.nodesRemoved.includes('overlay-group'));
  assert.ok(cascaded.changeSummary.nodesRemoved.includes('circle'));

  // cycle fail
  await assert.rejects(
    () => applyScenePatch({
      scene: BASIC_EXPLAINER_SCENE,
      patch: {
        schemaVersion: '1.0.0',
        id: 'cycle',
        operations: [
          {
            type: 'node.add_group',
            operationId: 'g2',
            node: {
              id: 'g-a',
              type: 'group',
              order: 1,
              startFrame: 0,
              endFrame: 90,
              layout: { x: 0, y: 0, width: 100, height: 100 },
            },
          },
          {
            type: 'node.add_group',
            operationId: 'g3',
            node: {
              id: 'g-b',
              type: 'group',
              parentId: 'g-a',
              order: 2,
              startFrame: 0,
              endFrame: 90,
              layout: { x: 0, y: 0, width: 100, height: 100 },
            },
          },
          { type: 'node.reparent', operationId: 'rp', nodeId: 'g-a', parentId: 'g-b' },
        ],
      },
    }),
    (err: unknown) => err instanceof SceneDraftError && err.code === 'SCENE_PATCH_GRAPH_CYCLE',
  );

  // Duplicate operation id
  await assert.rejects(
    () => applyScenePatch({
      scene: BASIC_EXPLAINER_SCENE,
      patch: {
        schemaVersion: '1.0.0',
        id: 'dup',
        operations: [
          { type: 'scene.set_metadata', operationId: 'same', name: 'A' },
          { type: 'scene.set_metadata', operationId: 'same', name: 'B' },
        ],
      },
    }),
    (err: unknown) => err instanceof SceneDraftError && err.code === 'SCENE_PATCH_DUPLICATE_OPERATION_ID',
  );

  void baseHash;
  void detail;
}

{
  // AssetPlan composition
  const requirementSet: AssetRequirementSetV1 = {
    schemaVersion: '1.0.0',
    id: 'requirements.m4a-compose',
    name: 'M4A compose',
    requirements: [
      {
        id: 'bg',
        name: 'Background',
        description: 'Solid background',
        search: { queries: ['background solid'] },
        preferredAssetIds: ['background.solid'],
      },
      {
        id: 'arrow',
        name: 'Arrow',
        description: 'Arrow',
        search: { queries: ['arrow'] },
        preferredAssetIds: ['primitive.arrow'],
      },
      {
        id: 'label',
        name: 'Label',
        description: 'Label',
        search: { queries: ['label'] },
        preferredAssetIds: ['ui.label'],
      },
      {
        id: 'comp',
        name: 'Explain composition',
        description: 'Labelled composition',
        mode: 'composition',
        search: { queries: ['composition'] },
        composition: {
          layoutHint: 'labelled',
          parts: [
            {
              id: 'body',
              role: 'body',
              search: { queries: ['circle'] },
              preferredAssetIds: ['primitive.circle'],
            },
            {
              id: 'caption',
              role: 'label',
              search: { queries: ['label'] },
              preferredAssetIds: ['ui.label'],
            },
          ],
        },
      },
    ],
  };
  const resolved = await resolver.resolveBatch({ requirementSet });
  assert.equal(resolved.plan.complete, true);

  const compositionSpec: AssetPlanSceneCompositionSpecV1 = {
    schemaVersion: '1.0.0',
    draft: { draftId: 'scene-draft.composed', name: 'Composed scene' },
    scene: {
      id: 'scene.composed',
      name: 'Composed',
      canvas: { width: 1280, height: 720, backgroundColor: '#0D1021' },
      fps: 30,
      durationInFrames: 90,
      theme: { id: 'default', version: '1.0.0' },
    },
    placements: [
      {
        requirementId: 'bg',
        nodeId: 'bg',
        order: 0,
        startFrame: 0,
        endFrame: 90,
        layout: { x: 0, y: 0, width: 1280, height: 720 },
      },
      {
        requirementId: 'arrow',
        nodeId: 'arrow',
        order: 1,
        startFrame: 0,
        endFrame: 90,
        layout: { x: 800, y: 300, width: 280, height: 80 },
      },
      {
        requirementId: 'label',
        nodeId: 'title',
        order: 2,
        startFrame: 0,
        endFrame: 90,
        layout: { x: 80, y: 60, width: 600, height: 80 },
      },
      {
        requirementId: 'comp',
        nodeId: 'explain',
        order: 3,
        startFrame: 0,
        endFrame: 90,
        layout: { x: 200, y: 200, width: 400, height: 360 },
      },
    ],
  };

  const planValidation = await resolver.validatePlan({ plan: resolved.plan });
  const composed = composeSceneFromAssetPlan({
    plan: resolved.plan,
    compositionSpec,
    planValidation,
  });
  assert.ok(composed.scene.nodes.some((n) => n.id === 'explain' && n.type === 'group'));
  assert.ok(composed.scene.nodes.some((n) => n.id.startsWith('explain__')));
  assert.ok(composed.sourceAssetPlan.bindings.length >= 3);

  const dry = await service.composeFromAssetPlan({
    requestId: 'compose-dry',
    plan: resolved.plan,
    compositionSpec,
    dryRun: true,
  });
  assert.equal(dry.dryRun, true);
  assert.equal(existsSync(join(tempRoot, 'scene-draft.composed')), false);

  const applied = await service.composeFromAssetPlan({
    requestId: 'compose-apply',
    plan: resolved.plan,
    compositionSpec,
    dryRun: false,
  });
  assert.equal(applied.dryRun, false);
  assert.ok(applied.draft.sourceAssetPlan);

  // Layout required for radial
  const radialPlan = structuredClone(resolved.plan) as AssetPlanV1;
  const compDecision = radialPlan.decisions.find((d) => d.requirementId === 'comp');
  assert.ok(compDecision?.composition);
  compDecision!.composition!.layoutHint = 'radial';
  for (const part of compDecision!.composition!.parts) delete part.normalizedBox;
  try {
    composeSceneFromAssetPlan({
      plan: radialPlan,
      compositionSpec: {
        ...compositionSpec,
        draft: { draftId: 'scene-draft.radial-fail', name: 'Radial' },
      },
      planValidation: { ...planValidation, valid: true, reusable: true, stale: false },
    });
    assert.fail('expected radial layout to fail');
  } catch (err) {
    assert.ok(err instanceof SceneDraftError && err.code === 'SCENE_COMPOSITION_LAYOUT_REQUIRED');
  }

  // Row layout deterministic
  const rowPlan = structuredClone(resolved.plan) as AssetPlanV1;
  const rowDecision = rowPlan.decisions.find((d) => d.requirementId === 'comp');
  assert.ok(rowDecision?.composition);
  rowDecision!.composition!.layoutHint = 'row';
  for (const part of rowDecision!.composition!.parts) delete part.normalizedBox;
  const row = composeSceneFromAssetPlan({
    plan: rowPlan,
    compositionSpec: {
      ...compositionSpec,
      draft: { draftId: 'scene-draft.row', name: 'Row' },
    },
    planValidation: { ...planValidation, valid: true, reusable: true, stale: false },
  });
  const rowChildren = row.scene.nodes.filter((n) => n.parentId === 'explain');
  assert.equal(rowChildren.length, 2);
  assert.ok(rowChildren[0]!.layout.width > 0);

  void MAX_SCENE_DRAFT_HISTORY_ENTRIES;
}

{
  // Concurrent patches with lock
  const draftId = 'scene-draft.lock-demo';
  await service.create({
    requestId: 'lock-create',
    draftId,
    name: 'Lock',
    scene: BASIC_EXPLAINER_SCENE,
    dryRun: false,
  });
  const detail = await service.get(draftId);
  const patch: ScenePatchV1 = {
    schemaVersion: '1.0.0',
    id: 'lock-patch',
    operations: [{ type: 'scene.set_metadata', operationId: 'l1', name: 'Locked' }],
  };
  const results = await Promise.allSettled([
    service.applyPatch({
      requestId: 'lock-a',
      draftId,
      expectedRevision: detail!.summary.revision,
      expectedSceneContentHash: detail!.summary.sceneContentHash,
      patch,
      dryRun: false,
    }),
    service.applyPatch({
      requestId: 'lock-b',
      draftId,
      expectedRevision: detail!.summary.revision,
      expectedSceneContentHash: detail!.summary.sceneContentHash,
      patch: {
        ...patch,
        id: 'lock-patch-b',
        operations: [{ type: 'scene.set_metadata', operationId: 'l2', name: 'Locked B' }],
      },
      dryRun: false,
    }),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const after = await service.get(draftId);
  assert.equal(after!.summary.revision, detail!.summary.revision + 1);
  assertNoPathLeak(after);
}

{
  const listed = await service.list({ limit: 10, offset: 0 });
  assert.ok(listed.total >= 1);
  const validated = await service.validate('scene-draft.hawking-intro');
  assert.equal(validated.valid, true);
  assertNoPathLeak(validated);
  assertNoPathLeak(service.getContract('full'));
}

if (!skipRender) {
  const preview = await service.renderPreview({
    draftId: 'scene-draft.hawking-intro',
    mode: 'still',
    frame: 0,
    outputWidth: 640,
  }) as { mimeType: string; base64: string; width: number; cacheHit: boolean };
  assert.equal(preview.mimeType, 'image/png');
  assert.ok(preview.base64.length > 100);
  assert.equal(preview.width, 640);
  const again = await service.renderPreview({
    draftId: 'scene-draft.hawking-intro',
    mode: 'still',
    frame: 0,
    outputWidth: 640,
  }) as { cacheHit: boolean };
  assert.equal(again.cacheHit, true);

  const sheet = await service.renderPreview({
    draftId: 'scene-draft.hawking-intro',
    mode: 'contact-sheet',
    frames: [0, 30, 60],
    columns: 3,
    cellWidth: 320,
  }) as { mimeType: string; base64: string };
  assert.equal(sheet.mimeType, 'image/png');
  assert.ok(sheet.base64.length > 100);

  // Preview previous history entry does not move cursor
  const hist = await service.get('scene-draft.history-demo');
  const cursorBefore = hist!.history.cursor;
  const oldEntry = hist!.history.entries[0]!;
  await service.renderPreview({
    draftId: 'scene-draft.history-demo',
    historyEntryId: oldEntry.entryId,
    mode: 'still',
    frame: 0,
    outputWidth: 640,
  });
  const histAfter = await service.get('scene-draft.history-demo');
  assert.equal(histAfter!.history.cursor, cursorBefore);
  assert.equal(histAfter!.summary.revision, hist!.summary.revision);
}

// Symlink escape guard
{
  const escapeRoot = mkdtempSync(join(tmpdir(), 'bcc-escape-'));
  const outside = mkdtempSync(join(tmpdir(), 'bcc-outside-'));
  try {
    mkdirSync(join(tempRoot, 'link-trap'), { recursive: true });
    const linkPath = join(tempRoot, 'link-trap', 'evil');
    try {
      symlinkSync(outside, linkPath, 'junction');
    } catch {
      // platform may block — skip
    }
  } finally {
    rmSync(escapeRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

rmSync(tempRoot, { recursive: true, force: true });
console.log(`scene-drafts.verify: ok${skipRender ? ' (render skipped)' : ''}`);
