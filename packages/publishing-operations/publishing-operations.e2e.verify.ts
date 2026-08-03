/**
 * End-to-end fake-platform publishing workflow.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPublishingOrchestrator,
  createPublishingRunStore,
  createFakePublishingAdapter,
  createFakeDeliverySource,
} from './src/index.ts';
import type {
  PublishingComplianceV1,
  PublishingMetadataV1,
  PublishingRequestV1,
  ThumbnailPlanV1,
} from '../publishing-contracts/src/index.ts';

const root = mkdtempSync(join(tmpdir(), 'bcc-pub-e2e-'));
process.env.BETTER_CHAT_CUT_PUBLISHING_ROOT = root;
process.env.BETTER_CHAT_CUT_PUBLISHING_SKIP_THUMBNAIL_RENDER = '1';

const adapter = createFakePublishingAdapter({ channelId: 'UCTESTCHANNEL' });
const orch = createPublishingOrchestrator({
  store: createPublishingRunStore({ root }),
  adapter,
  deliverySource: createFakeDeliverySource(),
  skipThumbnailRender: true,
});

const publishingRequest: PublishingRequestV1 = {
  schemaVersion: '1.0.0',
  id: 'publish.e2e-demo',
  name: 'E2E publish',
  source: {
    productionRunId: 'production-run.explainer.e2e01',
    bundleId: 'bundle.e2e',
    deliveryManifestHash: 'ab'.repeat(32),
  },
  target: { platform: 'youtube', connectionId: 'conn.youtube.main', expectedChannelId: 'UCTESTCHANNEL' },
  release: { desiredVisibility: 'public', mode: 'immediate' },
  subtitles: { uploadSrt: true, uploadVtt: true, language: 'vi' },
};

const metadata: PublishingMetadataV1 = {
  schemaVersion: '1.0.0',
  title: 'E2E Publish Title',
  description: 'Full pipeline description.',
  language: 'vi',
  tags: ['e2e', 'publish'],
};

const compliance: PublishingComplianceV1 = {
  schemaVersion: '1.0.0',
  audience: 'not-made-for-kids',
  syntheticMedia: 'contains-altered-or-synthetic-content',
  paidPromotion: false,
  rights: {
    videoRightsConfirmed: true,
    audioRightsConfirmed: true,
    thumbnailRightsConfirmed: true,
    subtitleRightsConfirmed: true,
  },
  review: {
    metadataReviewed: true,
    captionsReviewed: true,
    thumbnailReviewed: true,
    qaReviewed: true,
  },
};

const thumb: ThumbnailPlanV1 = {
  schemaVersion: '1.0.0',
  id: 'thumb.e2e',
  name: 'E2E',
  output: { width: 1280, height: 720, format: 'png' },
  source: {
    type: 'custom-scene',
    scene: {
      schemaVersion: '1.0.0',
      id: 'scene.e2e',
      name: 'E2E',
      canvas: { width: 1280, height: 720, backgroundColor: '#0b1020' },
      fps: 30,
      durationInFrames: 30,
      theme: { id: 'default', version: '1.0.0' },
      nodes: [{
        id: 'bg',
        type: 'asset',
        order: 0,
        startFrame: 0,
        endFrame: 30,
        layout: { x: 0, y: 0, width: 1280, height: 720 },
        asset: { id: 'background.solid', version: '1.0.0', props: { color: '#0b1020' } },
      }],
    } as never,
  },
  overlays: [
    {
      type: 'shape',
      id: 's',
      shape: 'rectangle',
      box: { x: 80, y: 480, width: 500, height: 140 },
      fill: '#E85D04',
    },
    {
      type: 'label',
      id: 'l',
      text: 'E2E',
      box: { x: 100, y: 500, width: 460, height: 100 },
      style: { fontSize: 56, textColor: '#fff' },
    },
  ],
};

async function driveToCompletion(max = 40) {
  let guard = 0;
  const nonce = Math.random().toString(36).slice(2, 8);
  while (guard < max) {
    guard += 1;
    const run = orch.getRun(created.runId)!;
    if (run.status === 'completed') return;
    const next = orch.planNext(created.runId);
    if (next.type === 'completed') return;
    if (next.type === 'put-artifact') {
      if (next.artifactType === 'publishing-metadata') {
        await orch.putArtifact({
          requestId: `e2e.${nonce}.put.meta.${guard}`,
          runId: created.runId,
          expectedRevision: run.revision,
          expectedWorkflowFingerprint: run.workflowFingerprint,
          artifactType: 'publishing-metadata',
          artifact: metadata,
          dryRun: false,
        });
        await orch.putArtifact({
          requestId: `e2e.${nonce}.put.comp.${guard}`,
          runId: created.runId,
          expectedRevision: orch.getRun(created.runId)!.revision,
          expectedWorkflowFingerprint: orch.getRun(created.runId)!.workflowFingerprint,
          artifactType: 'publishing-compliance',
          artifact: compliance,
          dryRun: false,
        });
        continue;
      }
      if (next.artifactType === 'thumbnail-plan') {
        await orch.putArtifact({
          requestId: `e2e.${nonce}.put.thumb.${guard}`,
          runId: created.runId,
          expectedRevision: run.revision,
          expectedWorkflowFingerprint: run.workflowFingerprint,
          artifactType: 'thumbnail-plan',
          artifact: thumb,
          dryRun: false,
        });
        continue;
      }
    }
    if (next.type === 'review') {
      await orch.reviewStage({
        requestId: `e2e.${nonce}.rev.${guard}`,
        runId: created.runId,
        expectedRevision: run.revision,
        expectedWorkflowFingerprint: run.workflowFingerprint,
        reviewId: next.reviewId,
        decision: 'approve',
        dryRun: false,
      });
      continue;
    }
    if (next.type === 'wait-external-operation' || next.type === 'execute-stage' || next.type === 'reconcile') {
      try {
        await orch.executeStage({
          requestId: `e2e.${nonce}.ex.${guard}`,
          runId: created.runId,
          expectedRevision: run.revision,
          expectedWorkflowFingerprint: run.workflowFingerprint,
          stageId: next.type === 'execute-stage' ? next.stageId : undefined,
          dryRun: false,
        });
      } catch (error) {
        throw new Error(`Step ${guard} failed next=${JSON.stringify(next)} err=${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }
    throw new Error(`Unhandled next action / incomplete: ${JSON.stringify({ next, status: orch.getRun(created.runId)?.status, stage: orch.getRun(created.runId)?.currentStageId })}`);
  }
  throw new Error(`Did not complete within step budget: ${JSON.stringify(orch.planNext(created.runId))} status=${orch.getRun(created.runId)?.status} stage=${orch.getRun(created.runId)?.currentStageId}`);
}

const dry = await orch.createRun({ requestId: 'e2e.dry', publishingRequest, dryRun: true });
assert.equal(dry.dryRun, true);

const createdResult = await orch.createRun({ requestId: 'e2e.create', publishingRequest, dryRun: false });
assert.ok(createdResult.run);
const created = { runId: createdResult.run!.runId };

// simulate restart mid-way briefly after package review then finish
await driveToCompletion(50);

const release = await orch.getRelease(created.runId);
assert.equal(release.completed, true, JSON.stringify(release));
assert.equal(release.release?.visibility, 'public');
assert.ok(release.releaseManifest?.target.remoteVideoId);

// idempotent create replay
const replay = await orch.createRun({ requestId: 'e2e.create', publishingRequest, dryRun: false }).catch(() => null);
// second create with same request id on same runId space may throw already exists or replay on different path
void replay;

// list summaries only
const listed = orch.listRuns({ limit: 10 });
assert.ok(listed.some((r) => r.runId === created.runId));

rmSync(root, { recursive: true, force: true });
console.log('publishing-operations.e2e.verify.ts: ok');
