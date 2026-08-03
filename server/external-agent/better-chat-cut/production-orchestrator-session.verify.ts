/**
 * Session-oriented orchestrator verification: edit-session wait + resume after reload.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProductionOrchestrator,
  createFakeAdapters,
  createProductionRunStore,
} from '../../../packages/explainer-production-runs/src/index.ts';
import type {
  ExplainerProductionRequestV1,
  ResearchBriefV1,
  ExplainerScriptV1,
  StoryboardV1,
} from '../../../packages/explainer-production-contracts/src/index.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-orch-session-'));
process.env.BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT = root;

const request: ExplainerProductionRequestV1 = {
  schemaVersion: '1.0.0',
  id: 'explainer.session',
  name: 'Session',
  topic: 'topic',
  objective: 'objective',
  audience: { description: 'aud' },
  language: 'vi',
  duration: { targetSeconds: 60 },
  output: { width: 1920, height: 1080, fps: 30, renderProfile: 'preview-720p-h264' },
  style: { visualStyle: 'c', tone: 't', pacing: 'balanced', complexity: 'introductory' },
  factualPolicy: { requireSources: true },
  project: { mode: 'existing-target', expectedProjectId: 'p-session' },
  workflow: { reviewMode: 'auto', projectMutationApproval: 'manual', requiredReviewStages: [] },
};

const research: ResearchBriefV1 = {
  schemaVersion: '1.0.0',
  id: 'r1',
  topic: 't',
  summary: 's',
  reviewed: true,
  sources: [{ id: 's1', title: 't', sourceType: 'article', reliability: 'secondary', url: 'https://example.com' }],
  claims: [{ id: 'c1', text: 'x', sourceIds: ['s1'], confidence: 'high', type: 'fact', reviewStatus: 'accepted' }],
};

const script: ExplainerScriptV1 = {
  schemaVersion: '1.0.0',
  id: 'sc1',
  title: 't',
  logline: 'l',
  targetDurationSeconds: 60,
  language: 'vi',
  sections: [{ id: 'sec', purpose: 'p', segments: [
    { id: 'seg1', narration: 'a', claimIds: ['c1'] },
    { id: 'seg2', narration: 'b', claimIds: ['c1'] },
  ] }],
};

const storyboard: StoryboardV1 = {
  schemaVersion: '1.0.0',
  id: 'st1',
  title: 't',
  output: { width: 1920, height: 1080, fps: 30 },
  scenes: [{
    id: 'scene1',
    name: 's',
    purpose: 'p',
    scriptSegmentIds: ['seg1', 'seg2'],
    claimIds: ['c1'],
    durationHintSeconds: 30,
    visualDescription: 'v',
    layout: { backgroundColor: '#000' },
    visualRequirements: [{
      id: 'vis1',
      name: 'v',
      description: 'd',
      role: 'primary',
      searchQueries: ['q'],
      placement: { nodeId: 'n1', order: 0, normalizedBox: { x: 0, y: 0, width: 1, height: 1 } },
    }],
  }],
};

try {
  const adapters = createFakeAdapters({
    projectTarget: {
      getTargetedProject: () => ({ projectId: 'p-session', width: 1920, height: 1080, fps: 30, targeted: true }),
    },
    // force fully resolved without authoring pause
    assetResolver: {
      async resolve(requirementSet) {
        return {
          plan: {
            schemaVersion: '1.0.0',
            id: 'plan',
            planHash: 'p',
            decisions: requirementSet.requirements.map((r) => ({
              requirementId: r.id,
              outcome: 'selected',
              selection: { assetId: `asset.${r.id}`, version: '1.0.0', strategy: 'exact' },
            })),
          } as never,
          hasCreationBriefs: false,
          hasDuplicateReview: false,
          unresolvedRequired: [],
        };
      },
    },
  });

  const orch = createProductionOrchestrator({
    store: createProductionRunStore({ root }),
    adapters,
  });

  let result = await orch.createRun({ requestId: 's.create', productionRequest: request, dryRun: false });
  const runId = result.run!.runId;
  let run = orch.getRun(runId)!;

  for (const [type, artifact, rid] of [
    ['research-brief', research, 's.research'],
    ['explainer-script', script, 's.script'],
    ['storyboard', storyboard, 's.story'],
  ] as const) {
    run = orch.getRun(runId)!;
    await orch.putArtifact({
      requestId: rid,
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      artifactType: type,
      artifact,
      dryRun: false,
    });
  }

  for (const stageId of ['asset-requirements', 'asset-resolution', 'scene-composition', 'scene-review', 'video-plan'] as const) {
    run = orch.getRun(runId)!;
    await orch.executeStage({
      requestId: `s.${stageId}`,
      runId,
      expectedRevision: run.revision,
      expectedWorkflowFingerprint: run.workflowFingerprint,
      stageId,
      dryRun: false,
    });
  }

  run = orch.getRun(runId)!;
  await orch.executeStage({
    requestId: 's.assembly',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    stageId: 'timeline-assembly',
    editSessionId: 'session.manual.1',
    dryRun: false,
  });
  run = orch.getRun(runId)!;
  assert.equal(run.stages.find((s) => s.stageId === 'timeline-assembly')?.status, 'awaiting-project-session');

  // reload service (simulates process restart)
  const reloaded = createProductionOrchestrator({
    store: createProductionRunStore({ root }),
    adapters,
  });
  run = reloaded.getRun(runId)!;
  await reloaded.resumeRun({
    requestId: 's.resume',
    runId,
    expectedRevision: run.revision,
    expectedWorkflowFingerprint: run.workflowFingerprint,
    dryRun: false,
  });
  run = reloaded.getRun(runId)!;
  assert.equal(run.stages.find((s) => s.stageId === 'timeline-assembly')?.status, 'completed');
  console.log('production-orchestrator-session.verify.ts: ok');
} finally {
  rmSync(root, { recursive: true, force: true });
}
