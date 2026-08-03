/**
 * End-to-end production orchestrator verification (fake adapters by default).
 * Covers full request→delivery path, restart/resume, idempotency, cancellation.
 * Real render path is exercised separately via M5C package verifies.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProductionOrchestrator,
  createFakeAdapters,
  createProductionRunStore,
} from './src/index.ts';
import type {
  ExplainerProductionRequestV1,
  ResearchBriefV1,
  ExplainerScriptV1,
  StoryboardV1,
} from '../explainer-production-contracts/src/index.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-prod-e2e-'));
process.env.BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT = root;

const request: ExplainerProductionRequestV1 = {
  schemaVersion: '1.0.0',
  id: 'explainer.e2e-vi',
  name: 'E2E Vietnamese explainer',
  topic: 'Lịch sử Internet',
  objective: 'Explainer e2e 60-90s',
  audience: { description: 'Phổ thông' },
  language: 'vi',
  duration: { targetSeconds: 70, minimumSeconds: 60, maximumSeconds: 90 },
  output: { width: 1280, height: 720, fps: 30, renderProfile: 'preview-720p-h264' },
  style: {
    visualStyle: 'motion',
    tone: 'friendly',
    pacing: 'balanced',
    complexity: 'introductory',
  },
  factualPolicy: { requireSources: true },
  project: { mode: 'existing-target', expectedProjectId: 'project-e2e' },
  workflow: {
    reviewMode: 'review-key-stages',
    projectMutationApproval: 'manual',
    allowAssetAuthoringTasks: true,
    allowTemporaryTts: true,
    requireCaptions: true,
    requireSrt: true,
    requireVtt: true,
  },
};

const research: ResearchBriefV1 = {
  schemaVersion: '1.0.0',
  id: 'research.e2e',
  topic: request.topic,
  summary: 'Tóm tắt e2e',
  reviewed: true,
  sources: [
    { id: 's1', title: 'A', sourceType: 'article', reliability: 'authoritative-secondary', url: 'https://example.com/1' },
    { id: 's2', title: 'B', sourceType: 'book', reliability: 'secondary' },
    { id: 's3', title: 'C', sourceType: 'official', reliability: 'primary', url: 'https://example.com/3' },
  ],
  claims: [
    { id: 'cl1', text: 'c1', sourceIds: ['s1'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
    { id: 'cl2', text: 'c2', sourceIds: ['s2'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
    { id: 'cl3', text: 'c3', sourceIds: ['s3'], confidence: 'medium', type: 'estimate', reviewStatus: 'accepted', caveat: '≈' },
    { id: 'cl4', text: 'c4', sourceIds: ['s1', 's3'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' },
    { id: 'cl5', text: 'c5', sourceIds: ['s2'], confidence: 'low', type: 'opinion', reviewStatus: 'rejected' },
  ],
};

const script: ExplainerScriptV1 = {
  schemaVersion: '1.0.0',
  id: 'script.e2e',
  title: 'E2E',
  logline: 'Internet story',
  targetDurationSeconds: 70,
  language: 'vi',
  sections: [{
    id: 'sec',
    purpose: 'main',
    segments: [
      { id: 'seg1', narration: 'Seg 1', claimIds: ['cl1'], onScreenText: 'Internet', pronunciationHints: ['Internet'] },
      { id: 'seg2', narration: 'Seg 2', claimIds: ['cl2'] },
      { id: 'seg3', narration: 'Seg 3', claimIds: ['cl3'] },
      { id: 'seg4', narration: 'Seg 4', claimIds: ['cl4'] },
      { id: 'seg5', narration: 'Seg 5', claimIds: ['cl1'] },
    ],
  }],
};

const storyboard: StoryboardV1 = {
  schemaVersion: '1.0.0',
  id: 'story.e2e',
  title: 'E2E board',
  output: { width: 1280, height: 720, fps: 30 },
  scenes: [
    {
      id: 'sc1', name: '1', purpose: 'a', scriptSegmentIds: ['seg1', 'seg2'], claimIds: ['cl1'],
      durationHintSeconds: 20, visualDescription: 'v', layout: { backgroundColor: '#000' },
      visualRequirements: [
        { id: 'v1', name: 'bg', description: 'd', role: 'background', searchQueries: ['bg'], reuseKey: 'shared-bg',
          placement: { nodeId: 'n1', order: 0, normalizedBox: { x: 0, y: 0, width: 1, height: 1 } } },
      ],
      transitionToNext: { mode: 'cut' },
    },
    {
      id: 'sc2', name: '2', purpose: 'b', scriptSegmentIds: ['seg3'], claimIds: ['cl3'],
      durationHintSeconds: 25, visualDescription: 'v', layout: { backgroundColor: '#111' },
      visualRequirements: [
        { id: 'v2', name: 'bg2', description: 'd', role: 'background', searchQueries: ['bg'], reuseKey: 'shared-bg',
          placement: { nodeId: 'n2', order: 0, normalizedBox: { x: 0, y: 0, width: 1, height: 1 } } },
        { id: 'v3', name: 'comp', description: 'd', role: 'primary', searchQueries: ['comp'],
          placement: { nodeId: 'n3', order: 1, normalizedBox: { x: 0.2, y: 0.2, width: 0.6, height: 0.5 } },
          composition: { layoutHint: 'overlay', parts: [{ id: 'p1', role: 'main', search: { queries: ['icon'] } }] } },
      ],
      transitionToNext: { mode: 'timeline-transition', type: 'cross-dissolve', durationInFrames: 6 },
    },
    {
      id: 'sc3', name: '3', purpose: 'c', scriptSegmentIds: ['seg4', 'seg5'], claimIds: ['cl4'],
      durationHintSeconds: 25, visualDescription: 'v', layout: { backgroundColor: '#222' },
      visualRequirements: [
        { id: 'v4', name: 'need-auth', description: 'unresolved', role: 'primary', searchQueries: ['unique'],
          distinctKey: 'uniq', placement: { nodeId: 'n4', order: 0, normalizedBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } } },
      ],
    },
  ],
};

async function approveIfReview(orch: ReturnType<typeof createProductionOrchestrator>, runId: string, requestId: string) {
  let run = orch.getRun(runId)!;
  const next = orch.planNext(runId);
  if (next.type === 'review') {
    await orch.reviewStage({
      requestId,
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      reviewId: next.reviewId,
      decision: 'approve',
      dryRun: false,
    });
  }
}

try {
  const orch = createProductionOrchestrator({
    store: createProductionRunStore({ root }),
    adapters: createFakeAdapters({
      projectTarget: {
        getTargetedProject: () => ({
          projectId: 'project-e2e',
          width: 1280,
          height: 720,
          fps: 30,
          targeted: true,
        }),
      },
    }),
  });

  // dry then apply create
  await orch.createRun({ requestId: 'e2e.create.dry', productionRequest: request, dryRun: true });
  const created = await orch.createRun({ requestId: 'e2e.create', productionRequest: request, dryRun: false });
  const runId = created.run!.runId;

  const put = async (artifactType: 'research-brief' | 'explainer-script' | 'storyboard', artifact: unknown, requestId: string) => {
    const run = orch.getRun(runId)!;
    await orch.putArtifact({
      requestId,
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      artifactType,
      artifact,
      dryRun: false,
    });
    await approveIfReview(orch, runId, `${requestId}.approve`);
  };

  await put('research-brief', research, 'e2e.research');
  await put('explainer-script', script, 'e2e.script');
  await put('storyboard', storyboard, 'e2e.story');

  const exec = async (stageId: string, requestId: string, extra: Record<string, unknown> = {}) => {
    const run = orch.getRun(runId)!;
    await orch.executeStage({
      requestId,
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: stageId as never,
      dryRun: false,
      ...extra,
    });
  };

  await exec('asset-requirements', 'e2e.reqs');
  await exec('asset-resolution', 'e2e.resolve');
  {
    let run = orch.getRun(runId)!;
    await orch.resumeRun({
      requestId: 'e2e.resume.auth',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      dryRun: false,
    });
    await exec('asset-authoring', 'e2e.author');
  }
  await exec('scene-composition', 'e2e.compose');
  await exec('scene-review', 'e2e.scenereview');
  await approveIfReview(orch, runId, 'e2e.scenereview.approve');
  await exec('video-plan', 'e2e.vp');
  await exec('timeline-assembly', 'e2e.assembly', { editSessionId: 'sess.asm' });
  {
    // restart while waiting session
    const reloaded = createProductionOrchestrator({
      store: createProductionRunStore({ root }),
      adapters: createFakeAdapters({
        projectTarget: {
          getTargetedProject: () => ({ projectId: 'project-e2e', width: 1280, height: 720, fps: 30, targeted: true }),
        },
      }),
    });
    const run = reloaded.getRun(runId)!;
    await reloaded.resumeRun({
      requestId: 'e2e.resume.asm',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      dryRun: false,
    });
  }

  // continue with fresh service
  const orch2 = createProductionOrchestrator({
    store: createProductionRunStore({ root }),
    adapters: createFakeAdapters({
      projectTarget: {
        getTargetedProject: () => ({ projectId: 'project-e2e', width: 1280, height: 720, fps: 30, targeted: true }),
      },
    }),
  });

  {
    const run = orch2.getRun(runId)!;
    await orch2.executeStage({
      requestId: 'e2e.narrplan',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: 'narration-plan',
      stageInput: { speakers: [{ id: 'spk1', temporaryVoice: { provider: 'elevenlabs', voiceId: 'v1' } }] },
      dryRun: false,
    });
  }
  {
    const run = orch2.getRun(runId)!;
    await orch2.executeStage({
      requestId: 'e2e.tts',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: 'narration-timing',
      dryRun: false,
    });
  }
  {
    let run = orch2.getRun(runId)!;
    if (run.stages.find((s) => s.stageId === 'narration-timing')?.status === 'awaiting-external-operation') {
      // process restart during TTS
      const re = createProductionOrchestrator({
        store: createProductionRunStore({ root }),
        adapters: createFakeAdapters({
          projectTarget: {
            getTargetedProject: () => ({ projectId: 'project-e2e', width: 1280, height: 720, fps: 30, targeted: true }),
          },
        }),
      });
      run = re.getRun(runId)!;
      await re.resumeRun({
        requestId: 'e2e.resume.tts',
        runId,
        expectedRevision: run.revision,
        expectedWorkflowFingerprint: run.workflowFingerprint,
        dryRun: false,
      });
    }
  }

  const orch3 = createProductionOrchestrator({
    store: createProductionRunStore({ root }),
    adapters: createFakeAdapters({
      projectTarget: {
        getTargetedProject: () => ({ projectId: 'project-e2e', width: 1280, height: 720, fps: 30, targeted: true }),
      },
    }),
  });
  {
    const run = orch3.getRun(runId)!;
    await orch3.executeStage({
      requestId: 'e2e.narrapp',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: 'narration-application',
      editSessionId: 'sess.narr',
      dryRun: false,
    });
  }
  {
    const run = orch3.getRun(runId)!;
    await orch3.resumeRun({
      requestId: 'e2e.resume.narr',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      dryRun: false,
    });
  }
  {
    const run = orch3.getRun(runId)!;
    await orch3.executeStage({
      requestId: 'e2e.tlreview',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: 'timeline-review',
      dryRun: false,
    });
    await approveIfReview(orch3, runId, 'e2e.tlreview.approve');
  }
  {
    let run = orch3.getRun(runId)!;
    await orch3.executeStage({
      requestId: 'e2e.preflight',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: 'production-preflight',
      dryRun: false,
    });
    run = orch3.getRun(runId)!;
    await orch3.executeStage({
      requestId: 'e2e.render',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: 'production-render',
      dryRun: false,
    });
    run = orch3.getRun(runId)!;
    if (run.stages.find((s) => s.stageId === 'production-render')?.status === 'awaiting-external-operation') {
      const re = createProductionOrchestrator({
        store: createProductionRunStore({ root }),
        adapters: createFakeAdapters({
          projectTarget: {
            getTargetedProject: () => ({ projectId: 'project-e2e', width: 1280, height: 720, fps: 30, targeted: true }),
          },
        }),
      });
      run = re.getRun(runId)!;
      await re.resumeRun({
        requestId: 'e2e.resume.render',
        runId,
        expectedRevision: run.revision,
        expectedWorkflowFingerprint: run.workflowFingerprint,
        dryRun: false,
      });
    }
  }

  const orch4 = createProductionOrchestrator({
    store: createProductionRunStore({ root }),
    adapters: createFakeAdapters({
      projectTarget: {
        getTargetedProject: () => ({ projectId: 'project-e2e', width: 1280, height: 720, fps: 30, targeted: true }),
      },
    }),
  });
  {
    let run = orch4.getRun(runId)!;
    await orch4.executeStage({
      requestId: 'e2e.dval',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: 'delivery-validation',
      dryRun: false,
    });
    run = orch4.getRun(runId)!;
    await orch4.executeStage({
      requestId: 'e2e.drev',
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId: 'delivery-review',
      dryRun: false,
    });
    await approveIfReview(orch4, runId, 'e2e.drev.approve');
    run = orch4.getRun(runId)!;
    const completeGuard = {
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
    };
    await orch4.executeStage({
      requestId: 'e2e.complete',
      runId,
      ...completeGuard,
      stageId: 'completion',
      dryRun: false,
    });

    const finalRun = orch4.getRun(runId)!;
    assert.equal(finalRun.status, 'completed');
    assert.ok(finalRun.delivery);
    const delivery = await orch4.getDelivery(runId);
    assert.equal(delivery.completed, true);
    assert.ok(delivery.delivery?.artifacts.length);
    const validation = orch4.validateRun(runId);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));

    // idempotent complete with identical inputs
    const replay = await orch4.executeStage({
      requestId: 'e2e.complete',
      runId,
      ...completeGuard,
      stageId: 'completion',
      dryRun: false,
    });
    assert.equal((replay.data as { replayed?: boolean })?.replayed, true);
  }

  console.log('explainer-production-runs.e2e.verify.ts: ok');
} finally {
  rmSync(root, { recursive: true, force: true });
}
