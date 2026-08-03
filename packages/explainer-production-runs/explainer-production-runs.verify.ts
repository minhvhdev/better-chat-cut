import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProductionOrchestrator,
  createFakeAdapters,
  createProductionRunStore,
  computeRunId,
  planNextAction,
  computeProductionWorkflowFingerprint,
  inspectRun,
  buildArtifactLineage,
  type ExplainerProductionRequestV1,
} from './src/index.ts';
import {
  type ResearchBriefV1,
  type ExplainerScriptV1,
  type StoryboardV1,
} from '../explainer-production-contracts/src/index.ts';

function sampleRequest(): ExplainerProductionRequestV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'explainer.hawking-radiation',
    name: 'Hawking radiation explainer',
    topic: 'Bức xạ Hawking',
    objective: 'Giải thích bức xạ Hawking.',
    audience: { description: 'Phổ thông' },
    language: 'vi',
    duration: { targetSeconds: 75, minimumSeconds: 60, maximumSeconds: 90 },
    output: { width: 1920, height: 1080, fps: 30, renderProfile: 'preview-720p-h264' },
    style: {
      visualStyle: 'clean',
      tone: 'clear',
      pacing: 'balanced',
      complexity: 'introductory',
      preferredTheme: { id: 'theme.default', version: '1.0.0' },
    },
    factualPolicy: { requireSources: true },
    project: { mode: 'existing-target', expectedProjectId: 'project-test' },
    workflow: {
      reviewMode: 'review-key-stages',
      projectMutationApproval: 'manual',
      allowTemporaryTts: true,
      requireCaptions: true,
      requireSrt: true,
      requireVtt: true,
      maximumStageRetries: 3,
    },
  };
}

function sampleResearch(): ResearchBriefV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'research.hawking',
    topic: 'Bức xạ Hawking',
    summary: 'Tóm tắt',
    reviewed: true,
    sources: [
      { id: 'src1', title: 'Paper', sourceType: 'paper', reliability: 'primary', url: 'https://example.com/a' },
      { id: 'src2', title: 'Article', sourceType: 'article', reliability: 'secondary', url: 'https://example.com/b' },
      { id: 'src3', title: 'Notes', sourceType: 'user-provided', reliability: 'unverified' },
    ],
    claims: [
      { id: 'c1', text: 'fact1', sourceIds: ['src1'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
      { id: 'c2', text: 'fact2', sourceIds: ['src1'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
      { id: 'c3', text: 'est', sourceIds: ['src2'], confidence: 'medium', type: 'estimate', reviewStatus: 'accepted', caveat: 'approx' },
      { id: 'c4', text: 'fact4', sourceIds: ['src2'], confidence: 'medium', type: 'fact', reviewStatus: 'accepted' },
      { id: 'c5', text: 'bad', sourceIds: ['src3'], confidence: 'low', type: 'opinion', reviewStatus: 'rejected' },
    ],
  };
}

function sampleScript(): ExplainerScriptV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'script.hawking',
    title: 'Script',
    logline: 'logline',
    targetDurationSeconds: 75,
    language: 'vi',
    sections: [{
      id: 'sec1',
      purpose: 'main',
      segments: [
        { id: 'seg1', narration: 'n1', claimIds: ['c1'], pronunciationHints: ['Hawking'] },
        { id: 'seg2', narration: 'n2', claimIds: ['c2'], onScreenText: 'On screen' },
        { id: 'seg3', narration: 'n3', claimIds: ['c3'] },
        { id: 'seg4', narration: 'n4', claimIds: ['c4'] },
        { id: 'seg5', narration: 'n5', claimIds: ['c1', 'c2'] },
      ],
    }],
  };
}

function sampleStoryboard(): StoryboardV1 {
  return {
    schemaVersion: '1.0.0',
    id: 'story.hawking',
    title: 'Story',
    output: { width: 1920, height: 1080, fps: 30 },
    scenes: [
      {
        id: 'scene1', name: 'S1', purpose: 'p', scriptSegmentIds: ['seg1', 'seg2'], claimIds: ['c1'],
        durationHintSeconds: 20, visualDescription: 'v', layout: { backgroundColor: '#000' },
        visualRequirements: [{
          id: 'vis_a', name: 'A', description: 'd', role: 'background', searchQueries: ['bg'],
          reuseKey: 'bg', placement: { nodeId: 'n_a', order: 0, normalizedBox: { x: 0, y: 0, width: 1, height: 1 } },
        }],
        transitionToNext: { mode: 'cut' },
      },
      {
        id: 'scene2', name: 'S2', purpose: 'p', scriptSegmentIds: ['seg3', 'seg4'], claimIds: ['c3'],
        durationHintSeconds: 30, visualDescription: 'v', layout: { backgroundColor: '#111' },
        visualRequirements: [
          {
            id: 'vis_b', name: 'B', description: 'd', role: 'background', searchQueries: ['bg'],
            reuseKey: 'bg', placement: { nodeId: 'n_b', order: 0, normalizedBox: { x: 0, y: 0, width: 1, height: 1 } },
          },
          {
            id: 'vis_c', name: 'C', description: 'd', role: 'primary', searchQueries: ['shape'],
            distinctKey: 'grp', placement: { nodeId: 'n_c', order: 1, normalizedBox: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 } },
            composition: { layoutHint: 'row', parts: [{ id: 'p1', role: 'x', search: { queries: ['x'] } }] },
          },
        ],
        transitionToNext: { mode: 'timeline-transition', type: 'cross-dissolve', durationInFrames: 8 },
      },
      {
        id: 'scene3', name: 'S3', purpose: 'p', scriptSegmentIds: ['seg5'], claimIds: ['c4'],
        durationHintSeconds: 25, visualDescription: 'v', layout: { backgroundColor: '#222' },
        visualRequirements: [{
          id: 'vis_d', name: 'D', description: 'missing asset', role: 'primary', searchQueries: ['unique-unresolved'],
          placement: { nodeId: 'n_d', order: 0, normalizedBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
        }],
      },
    ],
  };
}

const root = mkdtempSync(join(tmpdir(), 'bcc-prod-run-'));
process.env.BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT = root;

try {
  const store = createProductionRunStore({ root });
  const orch = createProductionOrchestrator({ store, adapters: createFakeAdapters() });

  // create dry-run no write
  {
    const dry = await orch.createRun({
      requestId: 'req.create.dry',
      productionRequest: sampleRequest(),
      dryRun: true,
    });
    assert.equal(dry.dryRun, true);
    assert.equal(store.listRuns().length, 0);
  }

  // create apply
  const created = await orch.createRun({
    requestId: 'req.create.apply',
    productionRequest: sampleRequest(),
    dryRun: false,
  });
  assert.equal(created.dryRun, false);
  assert.ok(created.run);
  const runId = created.run!.runId;
  assert.match(runId, /^production-run\./);
  assert.equal(created.run!.currentStageId, 'research');
  assert.equal(created.nextAction?.type, 'put-artifact');

  // root override
  assert.equal(store.root, root);

  // put research
  let run = store.getRun(runId)!;
  let put = await orch.putArtifact({
    requestId: 'req.put.research',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    artifactType: 'research-brief',
    artifact: sampleResearch(),
    dryRun: false,
  });
  assert.equal(put.nextAction?.type, 'review');
  run = store.getRun(runId)!;
  const reviewId = (put.nextAction as { reviewId: string }).reviewId;

  // approve research
  put = await orch.reviewStage({
    requestId: 'req.review.research',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    reviewId,
    decision: 'approve',
    dryRun: false,
  });
  run = store.getRun(runId)!;
  assert.equal(run.currentStageId, 'script');

  // script + storyboard
  put = await orch.putArtifact({
    requestId: 'req.put.script',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    artifactType: 'explainer-script',
    artifact: sampleScript(),
    dryRun: false,
  });
  run = store.getRun(runId)!;
  put = await orch.reviewStage({
    requestId: 'req.review.script',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    reviewId: (put.nextAction as { reviewId: string }).reviewId,
    decision: 'approve',
    dryRun: false,
  });
  run = store.getRun(runId)!;

  put = await orch.putArtifact({
    requestId: 'req.put.story',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    artifactType: 'storyboard',
    artifact: sampleStoryboard(),
    dryRun: false,
  });
  run = store.getRun(runId)!;
  put = await orch.reviewStage({
    requestId: 'req.review.story',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    reviewId: (put.nextAction as { reviewId: string }).reviewId,
    decision: 'approve',
    dryRun: false,
  });
  run = store.getRun(runId)!;
  assert.equal(run.currentStageId, 'asset-requirements');

  // asset requirements + resolution (pauses on authoring)
  let exec = await orch.executeStage({
    requestId: 'req.exec.reqs',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'asset-requirements',
    dryRun: false,
  });
  run = store.getRun(runId)!;
  exec = await orch.executeStage({
    requestId: 'req.exec.resolve',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'asset-resolution',
    dryRun: false,
  });
  run = store.getRun(runId)!;
  assert.equal(run.currentStageId, 'asset-authoring');

  // resume authoring
  exec = await orch.resumeRun({
    requestId: 'req.resume.author',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    dryRun: false,
  });
  run = store.getRun(runId)!;
  exec = await orch.executeStage({
    requestId: 'req.exec.author',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'asset-authoring',
    dryRun: false,
  });
  run = store.getRun(runId)!;

  // scenes
  exec = await orch.executeStage({
    requestId: 'req.exec.compose',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'scene-composition',
    dryRun: false,
  });
  run = store.getRun(runId)!;
  exec = await orch.executeStage({
    requestId: 'req.exec.scene.review',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'scene-review',
    dryRun: false,
  });
  run = store.getRun(runId)!;
  exec = await orch.reviewStage({
    requestId: 'req.review.scenes',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    reviewId: (exec.nextAction as { reviewId: string }).reviewId,
    decision: 'approve',
    dryRun: false,
  });
  run = store.getRun(runId)!;

  // video plan + timeline assembly manual session
  exec = await orch.executeStage({
    requestId: 'req.exec.vp',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'video-plan',
    dryRun: false,
  });
  run = store.getRun(runId)!;
  exec = await orch.executeStage({
    requestId: 'req.exec.assembly',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'timeline-assembly',
    editSessionId: 'session.assembly.1',
    dryRun: false,
  });
  run = store.getRun(runId)!;
  assert.equal(run.stages.find((s) => s.stageId === 'timeline-assembly')?.status, 'awaiting-project-session');

  // restart simulation: new orchestrator instance
  const orch2 = createProductionOrchestrator({
    store: createProductionRunStore({ root }),
    adapters: createFakeAdapters(),
  });
  run = orch2.getRun(runId)!;
  exec = await orch2.resumeRun({
    requestId: 'req.resume.session',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    dryRun: false,
  });
  run = orch2.getRun(runId)!;
  assert.equal(run.stages.find((s) => s.stageId === 'timeline-assembly')?.status, 'completed');

  // narration path
  exec = await orch2.executeStage({
    requestId: 'req.exec.narrplan',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'narration-plan',
    stageInput: {
      speakers: [{ id: 'spk1', temporaryVoice: { provider: 'elevenlabs', voiceId: 'v1' } }],
    },
    dryRun: false,
  });
  run = orch2.getRun(runId)!;
  exec = await orch2.executeStage({
    requestId: 'req.exec.tts',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'narration-timing',
    dryRun: false,
  });
  run = orch2.getRun(runId)!;
  // Fake completes immediately if status queued - force await by custom? Fake sets queued then resume completes.
  if (run.stages.find((s) => s.stageId === 'narration-timing')?.status === 'awaiting-external-operation') {
    exec = await orch2.resumeRun({
      requestId: 'req.resume.tts',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      dryRun: false,
    });
    run = orch2.getRun(runId)!;
  }

  exec = await orch2.executeStage({
    requestId: 'req.exec.narr.apply',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'narration-application',
    editSessionId: 'session.narr.1',
    dryRun: false,
  });
  run = orch2.getRun(runId)!;
  exec = await orch2.resumeRun({
    requestId: 'req.resume.narr',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    dryRun: false,
  });
  run = orch2.getRun(runId)!;

  // timeline review
  exec = await orch2.executeStage({
    requestId: 'req.exec.tl.review',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'timeline-review',
    dryRun: false,
  });
  run = orch2.getRun(runId)!;
  exec = await orch2.reviewStage({
    requestId: 'req.review.tl',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    reviewId: (exec.nextAction as { reviewId: string }).reviewId,
    decision: 'approve',
    dryRun: false,
  });
  run = orch2.getRun(runId)!;

  // preflight + render + delivery
  exec = await orch2.executeStage({
    requestId: 'req.exec.preflight',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'production-preflight',
    dryRun: false,
  });
  run = orch2.getRun(runId)!;
  exec = await orch2.executeStage({
    requestId: 'req.exec.render',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'production-render',
    dryRun: false,
  });
  run = orch2.getRun(runId)!;
  if (run.stages.find((s) => s.stageId === 'production-render')?.status === 'awaiting-external-operation') {
    // restart mid-render
    const orch3 = createProductionOrchestrator({
      store: createProductionRunStore({ root }),
      adapters: createFakeAdapters(),
    });
    run = orch3.getRun(runId)!;
    exec = await orch3.resumeRun({
      requestId: 'req.resume.render',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      dryRun: false,
    });
    run = orch3.getRun(runId)!;
  }

  const orchFinal = createProductionOrchestrator({
    store: createProductionRunStore({ root }),
    adapters: createFakeAdapters(),
  });
  run = orchFinal.getRun(runId)!;
  exec = await orchFinal.executeStage({
    requestId: 'req.exec.validate',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'delivery-validation',
    dryRun: false,
  });
  run = orchFinal.getRun(runId)!;
  exec = await orchFinal.executeStage({
    requestId: 'req.exec.del.review',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'delivery-review',
    dryRun: false,
  });
  run = orchFinal.getRun(runId)!;
  exec = await orchFinal.reviewStage({
    requestId: 'req.review.del',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    reviewId: (exec.nextAction as { reviewId: string }).reviewId,
    decision: 'approve',
    dryRun: false,
  });
  run = orchFinal.getRun(runId)!;
  const completeGuard = {
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
  };
  exec = await orchFinal.executeStage({
    requestId: 'req.exec.complete',
    runId,
    ...completeGuard,
    stageId: 'completion',
    dryRun: false,
  });
  run = orchFinal.getRun(runId)!;
  assert.equal(run.status, 'completed');
  assert.ok(run.delivery?.bundleId);

  // idempotency replay with identical inputs
  const replay = await orchFinal.executeStage({
    requestId: 'req.exec.complete',
    runId,
    ...completeGuard,
    stageId: 'completion',
    dryRun: false,
  });
  assert.equal((replay.data as { replayed?: boolean })?.replayed, true);

  // validate after mutations (replayed receipt does not change state)
  const runAfter = orchFinal.getRun(runId)!;
  const validation = orchFinal.validateRun(runId);
  if (!validation.valid) {
    console.error(JSON.stringify(validation, null, 2));
  }
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(computeProductionWorkflowFingerprint(runAfter), runAfter.workflowFingerprint);
  const lineage = buildArtifactLineage(orchFinal.store, run);
  assert.ok(lineage.length >= 5);
  const delivery = await orchFinal.getDelivery(runId);
  assert.equal(delivery.completed, true);
  assert.ok(delivery.delivery?.artifacts.some((a) => a.role === 'video'));
  assert.ok(!JSON.stringify(delivery).includes(root));

  // cancellation fixture
  const created2 = await orchFinal.createRun({
    requestId: 'req.create.cancel',
    productionRequest: {
      ...sampleRequest(),
      id: 'explainer.cancel-fixture',
    },
    dryRun: false,
  });
  const cancelId = created2.run!.runId;
  let cancelRun = orchFinal.getRun(cancelId)!;
  // put research then cancel while active
  await orchFinal.putArtifact({
    requestId: 'req.put.cancel.research',
    runId: cancelId,
    expectedRevision: cancelRun.revision,
    expectedWorkflowFingerprint: cancelRun.workflowFingerprint,
    artifactType: 'research-brief',
    artifact: sampleResearch(),
    dryRun: false,
  });
  cancelRun = orchFinal.getRun(cancelId)!;
  const cancelled = await orchFinal.cancelRun({
    requestId: 'req.cancel',
    runId: cancelId,
    expectedRevision: cancelRun.revision,
    expectedWorkflowFingerprint: cancelRun.workflowFingerprint,
    reason: 'fixture',
    dryRun: false,
  });
  assert.equal(cancelled.run?.status, 'cancelled');
  assert.equal((cancelled.data as { artifactsRetained?: boolean })?.artifactsRetained, true);
  assert.ok(orchFinal.store.getActiveArtifactContent(orchFinal.getRun(cancelId)!, 'research-brief'));

  // receipt conflict / already exists
  let threw = false;
  try {
    await orchFinal.createRun({
      requestId: 'req.create.duplicate-same-request',
      productionRequest: sampleRequest(),
      dryRun: false,
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true);

  // path safety / list / inspect
  assert.ok(orchFinal.listRuns({ limit: 5 }).length >= 1);
  assert.ok(inspectRun(run).nextAction);
  assert.ok(planNextAction(run).type === 'completed');

  // lock / atomic: revision conflict
  threw = false;
  try {
    await orchFinal.putArtifact({
      requestId: 'req.conflict',
      runId,
      expectedRevision: 1,
      expectedWorkflowFingerprint: 'wrong',
      artifactType: 'research-brief',
      artifact: sampleResearch(),
      dryRun: false,
    });
  } catch (error) {
    threw = true;
    assert.ok(error instanceof Error);
  }
  assert.equal(threw, true);

  assert.equal(computeRunId('explainer.x', 'abcdefgh'), 'production-run.x.abcdefgh');

  console.log('explainer-production-runs.verify.ts: ok');
} finally {
  rmSync(root, { recursive: true, force: true });
}
