import {
  createPublishingOrchestrator,
  createFakePublishingAdapter,
  PublishingOperationError,
  type PublishingOrchestrator,
} from '../../../packages/publishing-operations/src/index.ts';
import { PublishingContractError } from '../../../packages/publishing-contracts/src/index.ts';

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const readOnlyOpen = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const writeIdempotent = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeDestructive = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

let orchestratorForTests: PublishingOrchestrator | null = null;

export function setPublishingOrchestratorForTests(value: PublishingOrchestrator | null): void {
  orchestratorForTests = value;
}

function getOrchestrator(): PublishingOrchestrator {
  if (orchestratorForTests) return orchestratorForTests;
  return createPublishingOrchestrator({
    adapter: createFakePublishingAdapter(),
    skipThumbnailRender: process.env.BETTER_CHAT_CUT_PUBLISHING_SKIP_THUMBNAIL_RENDER === '1',
  });
}

export const PUBLISHING_CONTROL_TOOLS = [
  {
    name: 'publishing_get_contract',
    description: 'Return Better Chat Cut publishing contract: request/metadata/compliance/thumbnail/package/stages/reviews/credentials/upload/release limitations. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['summary', 'full'] },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'publishing_connection_inspect',
    description: 'Inspect a publishing target connection (opaque connectionId). Never returns tokens or secrets. May contact platform when live resolver configured.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        target: {
          type: 'object',
          additionalProperties: false,
          properties: {
            platform: { type: 'string', enum: ['youtube'] },
            connectionId: { type: 'string', minLength: 1, maxLength: 128 },
            expectedChannelId: { type: 'string', minLength: 1, maxLength: 128 },
          },
          required: ['platform', 'connectionId'],
        },
      },
      required: ['target'],
    },
    annotations: readOnlyOpen,
  },
  {
    name: 'publishing_package_validate',
    description: 'Validate a PublishingPackageV1 (hashes, delivery refs, metadata, compliance). No remote upload. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        package: { type: 'object' },
      },
      required: ['package'],
    },
    annotations: readOnly,
  },
  {
    name: 'publishing_run_create',
    description: 'Create a persistent PublishingRunV1 from a completed production delivery reference. dryRun=true by default.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        publishingRequest: { type: 'object' },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'publishingRequest'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'publishing_run_list',
    description: 'List publishing run summaries. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        offset: { type: 'number', minimum: 0 },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'publishing_run_get',
    description: 'Get publishing run summary, stages, artifact refs, pending action. No secrets or physical paths. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        runId: { type: 'string', minLength: 1 },
        includeStages: { type: 'boolean' },
        includeArtifactReferences: { type: 'boolean' },
        includePendingActions: { type: 'boolean' },
        includeRemoteSummary: { type: 'boolean' },
      },
      required: ['runId'],
    },
    annotations: readOnly,
  },
  {
    name: 'publishing_run_validate',
    description: 'Validate publishing run integrity locally (no platform contact by default). Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        runId: { type: 'string', minLength: 1 },
      },
      required: ['runId'],
    },
    annotations: readOnly,
  },
  {
    name: 'publishing_run_put_artifact',
    description: 'Put publishing-metadata, publishing-compliance, thumbnail-plan, or release-plan. dryRun=true by default.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        runId: { type: 'string', minLength: 1 },
        expectedRevision: { type: 'number', minimum: 1 },
        expectedWorkflowFingerprint: { type: 'string', minLength: 1 },
        artifactType: {
          type: 'string',
          enum: ['publishing-metadata', 'publishing-compliance', 'thumbnail-plan', 'release-plan'],
        },
        artifact: { type: 'object' },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'runId', 'expectedRevision', 'expectedWorkflowFingerprint', 'artifactType', 'artifact'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'publishing_run_plan_next',
    description: 'Return next publishing action (put-artifact, execute-stage, review, wait, reconcile, blocker, completed). Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        runId: { type: 'string', minLength: 1 },
      },
      required: ['runId'],
    },
    annotations: readOnly,
  },
  {
    name: 'publishing_run_execute_stage',
    description: 'Execute next (or specified) publishing stage. dryRun=true by default. Never accepts raw tokens or arbitrary paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        runId: { type: 'string', minLength: 1 },
        expectedRevision: { type: 'number', minimum: 1 },
        expectedWorkflowFingerprint: { type: 'string', minLength: 1 },
        stageId: { type: 'string' },
        stageInput: { type: 'object' },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'runId', 'expectedRevision', 'expectedWorkflowFingerprint'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'publishing_run_review',
    description: 'Approve or reject a publishing review checkpoint (metadata/thumbnail/package/release). dryRun=true by default. Never auto-publics.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        runId: { type: 'string', minLength: 1 },
        expectedRevision: { type: 'number', minimum: 1 },
        expectedWorkflowFingerprint: { type: 'string', minLength: 1 },
        reviewId: { type: 'string', minLength: 1 },
        decision: { type: 'string', enum: ['approve', 'reject'] },
        notes: { type: 'string' },
        requestedChanges: { type: 'array', items: { type: 'string' } },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'runId', 'expectedRevision', 'expectedWorkflowFingerprint', 'reviewId', 'decision'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'publishing_run_resume',
    description: 'Resume upload/processing once after restart. No tight loop, no duplicate upload, no release without review. dryRun=true by default.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        runId: { type: 'string', minLength: 1 },
        expectedRevision: { type: 'number', minimum: 1 },
        expectedWorkflowFingerprint: { type: 'string', minLength: 1 },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'runId', 'expectedRevision', 'expectedWorkflowFingerprint'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'publishing_run_cancel',
    description: 'Cancel a publishing run. Does not delete remote videos. dryRun=true by default.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        runId: { type: 'string', minLength: 1 },
        expectedRevision: { type: 'number', minimum: 1 },
        expectedWorkflowFingerprint: { type: 'string', minLength: 1 },
        reason: { type: 'string' },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'runId', 'expectedRevision', 'expectedWorkflowFingerprint'],
    },
    annotations: writeDestructive,
  },
  {
    name: 'publishing_run_get_release',
    description: 'Get release summary and ReleaseManifestV1 for a completed publishing run. No credentials or paths. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        runId: { type: 'string', minLength: 1 },
      },
      required: ['runId'],
    },
    annotations: readOnly,
  },
] as const;

function toolResult(payload: unknown) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function guardArgs(args: Record<string, unknown>) {
  return {
    requestId: String(args.requestId),
    expectedRevision: Number(args.expectedRevision),
    expectedWorkflowFingerprint: String(args.expectedWorkflowFingerprint),
    dryRun: args.dryRun !== false,
  };
}

function stripRun(
  run: NonNullable<ReturnType<PublishingOrchestrator['getRun']>>,
  options?: { includeStages?: boolean; includeArtifactReferences?: boolean; includeRemoteSummary?: boolean },
) {
  const includeStages = options?.includeStages !== false;
  const includeArtifactReferences = options?.includeArtifactReferences !== false;
  const includeRemoteSummary = options?.includeRemoteSummary !== false;
  return {
    runId: run.runId,
    requestId: run.requestId,
    requestHash: run.requestHash,
    revision: run.revision,
    status: run.status,
    currentStageId: run.currentStageId,
    source: run.source,
    target: run.target,
    workflowFingerprint: run.workflowFingerprint,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    upload: includeRemoteSummary
      ? {
        operationId: run.upload?.operationId,
        remoteVideoId: run.upload?.remoteVideoId,
        remoteFingerprint: run.upload?.remoteFingerprint,
      }
      : undefined,
    release: run.release,
    artifacts: includeArtifactReferences ? run.artifacts : undefined,
    stages: includeStages
      ? run.stages.map((s) => ({
        stageId: s.stageId,
        status: s.status,
        attempt: s.attempt,
        review: s.review,
        externalOperation: s.externalOperation,
        errorCodes: s.errors.map((e) => e.code),
        warningCodes: s.warnings.map((w) => w.code),
        outputArtifacts: s.outputArtifacts,
      }))
      : undefined,
  };
}

export async function runPublishingControlTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const orch = getOrchestrator();
  switch (name) {
    case 'publishing_get_contract':
      return toolResult(orch.getContract(args.format === 'full' ? 'full' : 'summary'));
    case 'publishing_connection_inspect':
      return toolResult(await orch.inspectConnection(args.target as never));
    case 'publishing_package_validate':
      return toolResult(orch.validatePackage(args.package));
    case 'publishing_run_create': {
      const result = await orch.createRun({
        requestId: String(args.requestId),
        publishingRequest: args.publishingRequest as never,
        dryRun: args.dryRun !== false,
      });
      return toolResult({
        dryRun: result.dryRun,
        run: result.run ? stripRun(result.run) : undefined,
        nextAction: result.nextAction,
        receipt: result.receipt,
        errors: result.errors,
        warnings: result.warnings,
      });
    }
    case 'publishing_run_list':
      return toolResult({
        runs: orch.listRuns({
          status: Array.isArray(args.status) ? args.status.map(String) : undefined,
          limit: typeof args.limit === 'number' ? args.limit : 20,
          offset: typeof args.offset === 'number' ? args.offset : 0,
        }),
      });
    case 'publishing_run_get': {
      const run = orch.getRun(String(args.runId));
      if (!run) throw new PublishingOperationError('PUBLISHING_RUN_NOT_FOUND', `Run not found: ${String(args.runId)}`);
      return toolResult({
        run: stripRun(run, {
          includeStages: args.includeStages !== false,
          includeArtifactReferences: args.includeArtifactReferences !== false,
          includeRemoteSummary: args.includeRemoteSummary !== false,
        }),
        nextAction: args.includePendingActions !== false ? orch.planNext(run.runId) : undefined,
      });
    }
    case 'publishing_run_validate':
      return toolResult(orch.validateRun(String(args.runId)));
    case 'publishing_run_put_artifact': {
      const g = guardArgs(args);
      const result = await orch.putArtifact({
        ...g,
        runId: String(args.runId),
        artifactType: args.artifactType as never,
        artifact: args.artifact,
      });
      return toolResult({
        dryRun: result.dryRun,
        run: result.run ? stripRun(result.run) : undefined,
        nextAction: result.nextAction,
        receipt: result.receipt,
        errors: result.errors,
        warnings: result.warnings,
      });
    }
    case 'publishing_run_plan_next':
      return toolResult({ nextAction: orch.planNext(String(args.runId)) });
    case 'publishing_run_execute_stage': {
      const g = guardArgs(args);
      const result = await orch.executeStage({
        ...g,
        runId: String(args.runId),
        stageId: typeof args.stageId === 'string' ? args.stageId as never : undefined,
        stageInput: args.stageInput && typeof args.stageInput === 'object'
          ? args.stageInput as Record<string, unknown>
          : undefined,
      });
      return toolResult({
        dryRun: result.dryRun,
        run: result.run ? stripRun(result.run) : undefined,
        nextAction: result.nextAction,
        receipt: result.receipt,
        data: result.data,
        errors: result.errors,
        warnings: result.warnings,
      });
    }
    case 'publishing_run_review': {
      const g = guardArgs(args);
      const result = await orch.reviewStage({
        ...g,
        runId: String(args.runId),
        reviewId: String(args.reviewId),
        decision: args.decision === 'reject' ? 'reject' : 'approve',
        notes: typeof args.notes === 'string' ? args.notes : undefined,
        requestedChanges: Array.isArray(args.requestedChanges) ? args.requestedChanges.map(String) : undefined,
      });
      return toolResult({
        dryRun: result.dryRun,
        run: result.run ? stripRun(result.run) : undefined,
        nextAction: result.nextAction,
        review: result.review,
        receipt: result.receipt,
        errors: result.errors,
        warnings: result.warnings,
      });
    }
    case 'publishing_run_resume': {
      const g = guardArgs(args);
      const result = await orch.resumeRun({ ...g, runId: String(args.runId) });
      return toolResult({
        dryRun: result.dryRun,
        run: result.run ? stripRun(result.run) : undefined,
        nextAction: result.nextAction,
        receipt: result.receipt,
        errors: result.errors,
        warnings: result.warnings,
      });
    }
    case 'publishing_run_cancel': {
      const g = guardArgs(args);
      const result = await orch.cancelRun({
        ...g,
        runId: String(args.runId),
        reason: typeof args.reason === 'string' ? args.reason : undefined,
      });
      return toolResult({
        dryRun: result.dryRun,
        run: result.run ? stripRun(result.run) : undefined,
        nextAction: result.nextAction,
        receipt: result.receipt,
        data: result.data,
        errors: result.errors,
        warnings: result.warnings,
      });
    }
    case 'publishing_run_get_release':
      return toolResult(await orch.getRelease(String(args.runId)));
    default:
      throw new PublishingOperationError('PUBLISHING_RUN_STAGE_NOT_READY', `Unknown tool: ${name}`);
  }
}

export { PublishingOperationError, PublishingContractError };
