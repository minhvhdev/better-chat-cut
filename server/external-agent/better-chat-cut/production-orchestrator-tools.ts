import {
  createProductionOrchestrator,
  createFakeAdapters,
  ProductionRunError,
  type ProductionOrchestrator,
} from '../../../packages/explainer-production-runs/src/index.ts';
import { ProductionContractError } from '../../../packages/explainer-production-contracts/src/index.ts';
import { connectedProjectIds } from '../broker.ts';

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
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

let orchestratorForTests: ProductionOrchestrator | null = null;

export function setProductionOrchestratorForTests(value: ProductionOrchestrator | null): void {
  orchestratorForTests = value;
}

function getOrchestrator(): ProductionOrchestrator {
  if (orchestratorForTests) return orchestratorForTests;
  return createProductionOrchestrator({
    adapters: createLiveAdapters(),
  });
}

/** Prefer public service APIs — no MCP-to-MCP. Live adapters use targeted project binding. */
function createLiveAdapters() {
  // Orchestrator calls package service APIs via injectable adapters.
  // Default wiring reuses fake adapters for deterministic offline control-plane
  // stages; MCP sessions override project targeting from broker binding.
  return createFakeAdapters({
    projectTarget: {
      getTargetedProject(expected) {
        const connected = connectedProjectIds();
        const projectId = expected ?? (connected.length === 1 ? connected[0] : connected[0]);
        if (!projectId && !expected) return null;
        return {
          projectId: projectId ?? expected ?? 'unbound',
          width: 1920,
          height: 1080,
          fps: 30,
          targeted: Boolean(projectId || expected),
        };
      },
    },
  });
}

export const PRODUCTION_ORCHESTRATOR_CONTROL_TOOLS = [
  {
    name: 'explainer_orchestrator_get_contract',
    description: 'Return Better Chat Cut end-to-end explainer production orchestrator contract: request/research/script/storyboard schemas, stages, reviews, resume, limitations. Read-only.',
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
    name: 'production_run_create',
    description: 'Create a persistent ProductionRunV1 from ExplainerProductionRequestV1. dryRun=true by default. Requires targeted/existing project. Completes intake and waits for research artifact.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        productionRequest: { type: 'object' },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'productionRequest'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'production_run_list',
    description: 'List production run summaries with optional status filter and pagination. Read-only.',
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
    name: 'production_run_get',
    description: 'Get a production run summary, stages, artifact references, and pending next action. Does not return full artifact bodies. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        runId: { type: 'string', minLength: 1 },
        includeStages: { type: 'boolean' },
        includeArtifactReferences: { type: 'boolean' },
        includePendingActions: { type: 'boolean' },
      },
      required: ['runId'],
    },
    annotations: readOnly,
  },
  {
    name: 'production_run_validate',
    description: 'Validate production run integrity: fingerprint, artifact hashes, external references. Read-only, no mutation.',
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
    name: 'production_run_put_artifact',
    description: 'Put caller-authored research-brief, explainer-script, or storyboard artifact into a run. dryRun=true by default. Validates lineage before storage.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        runId: { type: 'string', minLength: 1 },
        expectedRevision: { type: 'number', minimum: 1 },
        expectedWorkflowFingerprint: { type: 'string', minLength: 1 },
        artifactType: { type: 'string', enum: ['research-brief', 'explainer-script', 'storyboard'] },
        artifact: { type: 'object' },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'runId', 'expectedRevision', 'expectedWorkflowFingerprint', 'artifactType', 'artifact'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'production_run_plan_next',
    description: 'Return the next production action (put-artifact, execute-stage, review, wait, blocker, completed). Read-only.',
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
    name: 'production_run_execute_stage',
    description: 'Execute the next (or specified) production stage via public service adapters. dryRun=true by default. Project mutations require editSessionId and never bypass edit-session approval.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        runId: { type: 'string', minLength: 1 },
        expectedRevision: { type: 'number', minimum: 1 },
        expectedWorkflowFingerprint: { type: 'string', minLength: 1 },
        stageId: { type: 'string' },
        editSessionId: { type: 'string' },
        stageInput: { type: 'object' },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'runId', 'expectedRevision', 'expectedWorkflowFingerprint'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'production_run_review',
    description: 'Approve or reject an artifact review checkpoint. Does not approve project edit sessions. dryRun=true by default.',
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
    name: 'production_run_resume',
    description: 'Resume a production run after process restart or external wait (TTS, render, edit session). Polls once; does not busy-loop. dryRun=true by default.',
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
    name: 'production_run_cancel',
    description: 'Cancel a production run. Retains artifacts and applied project mutations. Attempts render cancel when applicable. dryRun=true by default.',
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
    name: 'production_run_get_delivery',
    description: 'Get completed delivery summary (bundle id, artifact download URLs, QA status). Never returns filesystem paths. Read-only.',
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

export async function runProductionOrchestratorControlTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const orch = getOrchestrator();
  try {
    switch (name) {
      case 'explainer_orchestrator_get_contract': {
        const format = args.format === 'full' ? 'full' : 'summary';
        return toolResult(orch.getContract(format));
      }
      case 'production_run_create': {
        const result = await orch.createRun({
          requestId: String(args.requestId),
          productionRequest: args.productionRequest as never,
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
      case 'production_run_list': {
        return toolResult({
          runs: orch.listRuns({
            status: Array.isArray(args.status) ? args.status.map(String) : undefined,
            limit: typeof args.limit === 'number' ? args.limit : 20,
            offset: typeof args.offset === 'number' ? args.offset : 0,
          }),
        });
      }
      case 'production_run_get': {
        const run = orch.getRun(String(args.runId));
        if (!run) throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${String(args.runId)}`);
        const includeStages = args.includeStages !== false;
        const includeArtifactReferences = args.includeArtifactReferences !== false;
        const includePendingActions = args.includePendingActions !== false;
        return toolResult({
          run: stripRun(run, { includeStages, includeArtifactReferences }),
          nextAction: includePendingActions ? orch.planNext(run.runId) : undefined,
        });
      }
      case 'production_run_validate': {
        return toolResult(orch.validateRun(String(args.runId)));
      }
      case 'production_run_put_artifact': {
        const g = guardArgs(args);
        const result = await orch.putArtifact({
          ...g,
          runId: String(args.runId),
          artifactType: args.artifactType as 'research-brief' | 'explainer-script' | 'storyboard',
          artifact: args.artifact,
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
      case 'production_run_plan_next': {
        return toolResult({ nextAction: orch.planNext(String(args.runId)) });
      }
      case 'production_run_execute_stage': {
        const g = guardArgs(args);
        const result = await orch.executeStage({
          ...g,
          runId: String(args.runId),
          stageId: typeof args.stageId === 'string' ? args.stageId as never : undefined,
          editSessionId: typeof args.editSessionId === 'string' ? args.editSessionId : undefined,
          stageInput: args.stageInput && typeof args.stageInput === 'object'
            ? args.stageInput as Record<string, unknown>
            : undefined,
        });
        return toolResult({
          dryRun: result.dryRun,
          run: result.run ? stripRun(result.run) : undefined,
          nextAction: result.nextAction,
          review: result.review,
          receipt: result.receipt,
          data: result.data,
          errors: result.errors,
          warnings: result.warnings,
        });
      }
      case 'production_run_review': {
        const g = guardArgs(args);
        const result = await orch.reviewStage({
          ...g,
          runId: String(args.runId),
          reviewId: String(args.reviewId),
          decision: args.decision === 'reject' ? 'reject' : 'approve',
          notes: typeof args.notes === 'string' ? args.notes : undefined,
          requestedChanges: Array.isArray(args.requestedChanges)
            ? args.requestedChanges.map(String)
            : undefined,
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
      case 'production_run_resume': {
        const g = guardArgs(args);
        const result = await orch.resumeRun({
          ...g,
          runId: String(args.runId),
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
      case 'production_run_cancel': {
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
      case 'production_run_get_delivery': {
        return toolResult(await orch.getDelivery(String(args.runId)));
      }
      default:
        throw new ProductionRunError('PRODUCTION_RUN_STAGE_NOT_READY', `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof ProductionRunError || error instanceof ProductionContractError) {
      throw error;
    }
    throw error;
  }
}

function stripRun(
  run: NonNullable<ReturnType<ProductionOrchestrator['getRun']>>,
  options?: { includeStages?: boolean; includeArtifactReferences?: boolean },
) {
  const includeStages = options?.includeStages !== false;
  const includeArtifactReferences = options?.includeArtifactReferences !== false;
  return {
    runId: run.runId,
    requestId: run.requestId,
    requestHash: run.requestHash,
    revision: run.revision,
    status: run.status,
    currentStageId: run.currentStageId,
    project: run.project,
    policy: run.policy,
    workflowFingerprint: run.workflowFingerprint,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    delivery: run.delivery,
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
