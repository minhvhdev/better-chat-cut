import {
  validateProductionRequest,
  validateResearchBrief,
  validateExplainerScript,
  validateStoryboard,
  storyboardToAssetRequirementSet,
  storyboardSceneToCompositionSpec,
  storyboardToVideoPlan,
  scriptToNarrationPlan,
  mergeProductionPolicy,
  productionDiagnostic,
  sha256Hex,
  stableStringify,
  type ExplainerProductionRequestV1,
  type ResearchBriefV1,
  type ExplainerScriptV1,
  type StoryboardV1,
  type ProductionArtifactType,
  type ProductionStageId,
  type ProductionDiagnostic,
} from '../../../explainer-production-contracts/src/index.ts';
import type { ProductionRunV1 } from '../contracts/production-run.ts';
import type { ProductionArtifactEnvelopeV1 } from '../contracts/production-artifact-envelope.ts';
import type { ProductionReviewV1 } from '../contracts/production-review.ts';
import type { ProductionRunReceiptV1 } from '../contracts/production-receipt.ts';
import type { ProductionRunEventV1 } from '../contracts/production-event.ts';
import type {
  ProductionNextActionV1,
  ProductionRunDeliverySummaryV1,
  ProductionRunSummaryV1,
  ProductionRunValidationResultV1,
  MotionAssetAuthoringTaskSetV1,
  SceneDraftSetArtifactV1,
} from '../contracts/production-run-summary.ts';
import { ProductionRunError } from '../contracts/production-run-errors.ts';
import { createProductionRunStore, type ProductionRunStore } from '../storage/production-run-store.ts';
import {
  createInitialStageStates,
  getStageState,
  stageRequiresReview,
  STAGE_DESCRIPTORS,
} from '../workflow/stage-registry.ts';
import { ARTIFACT_DOWNSTREAM, invalidateFromStage } from '../workflow/stage-dependencies.ts';
import { computeProductionWorkflowFingerprint } from '../workflow/run-fingerprint.ts';
import { computeEventId, computeReviewId, computeRunId } from '../workflow/run-revision.ts';
import { planNextAction } from '../workflow/stage-planner.ts';
import {
  createFakeAdapters,
  type ProductionServiceAdapters,
  type StageInputExtras,
} from '../adapters/service-adapters.ts';
import type { NarrationSpeakerV1 } from '../../../narration-plans/src/contracts/narration-speaker.ts';
import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import type { NarrationPlanV1 } from '../../../narration-plans/src/contracts/narration-plan.ts';
import type { AssetPlanV1 } from '../../../asset-resolver/src/contracts/asset-plan.ts';

const ADAPTER_REVISION = '1.0.0';

export type ProductionWriteGuard = {
  requestId: string;
  expectedRevision: number;
  expectedWorkflowFingerprint: string;
  dryRun?: boolean;
};

export type CreateProductionRunInput = {
  requestId: string;
  productionRequest: ExplainerProductionRequestV1;
  dryRun?: boolean;
};

export type PutArtifactInput = ProductionWriteGuard & {
  runId: string;
  artifactType: 'research-brief' | 'explainer-script' | 'storyboard';
  artifact: unknown;
};

export type ExecuteStageInput = ProductionWriteGuard & {
  runId: string;
  stageId?: ProductionStageId;
  editSessionId?: string;
  stageInput?: StageInputExtras;
};

export type ReviewStageInput = ProductionWriteGuard & {
  runId: string;
  reviewId: string;
  decision: 'approve' | 'reject';
  notes?: string;
  requestedChanges?: string[];
};

export type ResumeRunInput = ProductionWriteGuard & { runId: string };
export type CancelRunInput = ProductionWriteGuard & { runId: string; reason?: string };

export type OrchestratorResult<T = unknown> = {
  dryRun: boolean;
  run?: ProductionRunV1;
  runSummary?: ProductionRunSummaryV1;
  nextAction?: ProductionNextActionV1;
  receipt?: ProductionRunReceiptV1;
  review?: ProductionReviewV1;
  delivery?: ProductionRunDeliverySummaryV1;
  errors: ProductionDiagnostic[];
  warnings: ProductionDiagnostic[];
  data?: T;
};

function nowIso(): string {
  return new Date().toISOString();
}

function inputHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function summarize(run: ProductionRunV1): ProductionRunSummaryV1 {
  return {
    runId: run.runId,
    requestId: run.requestId,
    status: run.status,
    currentStageId: run.currentStageId,
    revision: run.revision,
    workflowFingerprint: run.workflowFingerprint,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    deliveryBundleId: run.delivery?.bundleId,
  };
}

function setActiveArtifact(
  run: ProductionRunV1,
  artifactType: ProductionArtifactType,
  artifactHash: string,
): void {
  const without = run.artifacts.filter((a) => a.artifactType !== artifactType);
  without.push({ artifactType, artifactHash });
  run.artifacts = without;
}

function clearArtifacts(run: ProductionRunV1, types: ProductionArtifactType[]): void {
  const remove = new Set(types);
  run.artifacts = run.artifacts.filter((a) => !remove.has(a.artifactType));
}

function bumpRevision(run: ProductionRunV1): void {
  run.revision += 1;
  run.updatedAt = nowIso();
  run.status = deriveRunStatus(run);
  run.workflowFingerprint = computeProductionWorkflowFingerprint(run);
}

function deriveRunStatus(run: ProductionRunV1): ProductionRunV1['status'] {
  if (run.status === 'cancelled') return 'cancelled';
  const completion = getStageState(run, 'completion');
  if (completion.status === 'completed' && run.delivery) {
    return 'completed';
  }
  if (run.stages.every((s) => s.status === 'completed' || s.status === 'skipped') && run.delivery) {
    return 'completed';
  }
  const current = getStageState(run, run.currentStageId);
  if (current.status === 'awaiting-review') return 'awaiting-review';
  if (current.status === 'awaiting-input') return 'awaiting-input';
  if (current.status === 'awaiting-project-session' || current.status === 'awaiting-external-operation') {
    return 'awaiting-external-operation';
  }
  if (current.status === 'blocked' || current.status === 'failed') return current.status === 'failed' ? 'failed' : 'blocked';
  return 'active';
}

function findActiveReviewArtifactRefs(run: ProductionRunV1, stageId: ProductionStageId): {
  artifactType: ProductionArtifactType;
  artifactHash: string;
}[] {
  const map: Partial<Record<ProductionStageId, ProductionArtifactType>> = {
    research: 'research-brief',
    script: 'explainer-script',
    storyboard: 'storyboard',
    'scene-review': 'scene-review-report',
    'timeline-review': 'narration-application-report',
    'delivery-review': 'delivery-validation-report',
  };
  const type = map[stageId];
  if (!type) return [];
  const ref = run.artifacts.find((a) => a.artifactType === type);
  return ref ? [ref] : [];
}

export function createProductionOrchestrator(options?: {
  store?: ProductionRunStore;
  adapters?: ProductionServiceAdapters;
  root?: string;
}) {
  const store = options?.store ?? createProductionRunStore({ root: options?.root });
  const adapters = options?.adapters ?? createFakeAdapters();

  async function replayOrConflict(
    runId: string,
    requestId: string,
    hash: string,
  ): Promise<OrchestratorResult | null> {
    const existing = store.getReceipt(runId, requestId);
    if (!existing) return null;
    if (existing.inputHash !== hash) {
      throw new ProductionRunError(
        'PRODUCTION_RUN_REQUEST_ID_REUSE_CONFLICT',
        `Request id ${requestId} reused with different input`,
        { runId, recovery: 'Use a new requestId for different operations' },
      );
    }
    const run = store.getRun(runId);
    return {
      dryRun: false,
      run: run ?? undefined,
      runSummary: run ? summarize(run) : undefined,
      nextAction: run ? planNextAction(run) : undefined,
      receipt: existing,
      errors: [],
      warnings: [],
      data: { replayed: true },
    };
  }

  function assertGuard(run: ProductionRunV1, guard: ProductionWriteGuard): void {
    if (run.revision !== guard.expectedRevision) {
      throw new ProductionRunError('PRODUCTION_RUN_REVISION_CONFLICT', 'Revision conflict', {
        runId: run.runId,
        details: { expected: guard.expectedRevision, actual: run.revision },
        recovery: 'Reload production_run_get and retry with current revision',
      });
    }
    if (run.workflowFingerprint !== guard.expectedWorkflowFingerprint) {
      throw new ProductionRunError('PRODUCTION_RUN_FINGERPRINT_CONFLICT', 'Workflow fingerprint conflict', {
        runId: run.runId,
        recovery: 'Reload production_run_get and retry with current fingerprint',
      });
    }
    if (run.status === 'cancelled') {
      throw new ProductionRunError('PRODUCTION_RUN_CANCELLED', 'Run is cancelled', { runId: run.runId });
    }
  }

  function writeEnvelope(
    run: ProductionRunV1,
    stageId: ProductionStageId,
    artifactType: ProductionArtifactType,
    content: unknown,
    inputs: { artifactType: ProductionArtifactType; artifactHash: string }[],
    dryRun: boolean,
  ): ProductionArtifactEnvelopeV1 {
    const artifactHash = store.computeArtifactHash(artifactType, content);
    const envelope: ProductionArtifactEnvelopeV1 = {
      schemaVersion: '1.0.0',
      artifactType,
      artifactSchemaVersion: '1.0.0',
      artifactHash,
      producer: { stageId, adapterRevision: ADAPTER_REVISION },
      inputs,
      content,
      createdAt: nowIso(),
    };
    if (!dryRun) {
      store.writeArtifactEnvelope(run.runId, envelope);
    }
    setActiveArtifact(run, artifactType, artifactHash);
    return envelope;
  }

  function completeStage(
    run: ProductionRunV1,
    stageId: ProductionStageId,
    outputs: { artifactType: ProductionArtifactType; artifactHash: string }[],
  ): void {
    const stage = getStageState(run, stageId);
    stage.status = 'completed';
    stage.completedAt = nowIso();
    stage.outputArtifacts = outputs;
    stage.errors = [];
  }

  function awaitReview(
    run: ProductionRunV1,
    stageId: ProductionStageId,
    dryRun: boolean,
  ): ProductionReviewV1 {
    const refs = findActiveReviewArtifactRefs(run, stageId);
    const reviewId = computeReviewId({ runId: run.runId, stageId, artifactReferences: refs });
    const review: ProductionReviewV1 = {
      schemaVersion: '1.0.0',
      reviewId,
      runId: run.runId,
      stageId,
      artifactReferences: refs,
      status: 'pending',
      createdAt: nowIso(),
    };
    const stage = getStageState(run, stageId);
    stage.status = 'awaiting-review';
    stage.review = { reviewId, status: 'pending' };
    run.currentStageId = stageId;
    if (!dryRun) store.writeReview(run.runId, review);
    return review;
  }

  function invalidateDownstreamFromArtifact(
    run: ProductionRunV1,
    artifactType: ProductionArtifactType,
  ): void {
    const downstream = ARTIFACT_DOWNSTREAM[artifactType] ?? [];
    clearArtifacts(run, downstream);
    const stageMap: Partial<Record<ProductionArtifactType, ProductionStageId>> = {
      'research-brief': 'research',
      'explainer-script': 'script',
      storyboard: 'storyboard',
      'asset-plan': 'asset-resolution',
      'scene-draft-set': 'scene-composition',
      'video-plan': 'video-plan',
      'narration-timing': 'narration-timing',
    };
    const origin = stageMap[artifactType];
    if (!origin) return;
    for (const stageId of invalidateFromStage(origin)) {
      const stage = getStageState(run, stageId);
      if (stage.status === 'completed' || stage.status === 'awaiting-review' || stage.status === 'skipped') {
        stage.status = 'pending';
        stage.outputArtifacts = [];
        stage.review = undefined;
        stage.externalOperation = undefined;
        stage.completedAt = undefined;
        stage.errors = [];
        stage.warnings = [];
      }
    }
  }

  async function createRun(input: CreateProductionRunInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false; // default true
    const validated = validateProductionRequest(input.productionRequest);
    if (!validated.valid || !validated.normalizedRequest || !validated.requestHash) {
      throw new ProductionRunError('PRODUCTION_REQUEST_INVALID', 'Invalid production request', {
        diagnostics: validated.errors,
        recovery: 'Fix ExplainerProductionRequestV1 fields',
      });
    }
    const request = validated.normalizedRequest;
    const requestHash = validated.requestHash;
    const runId = computeRunId(request.id, requestHash);
    const hash = inputHash({ op: 'create-run', requestId: input.requestId, productionRequest: request });

    if (!dryRun) {
      const replay = await replayOrConflict(runId, input.requestId, hash);
      if (replay) return replay;
    }

    const project = adapters.projectTarget.getTargetedProject(request.project.expectedProjectId);
    if (!project?.targeted) {
      throw new ProductionRunError('PRODUCTION_RUN_PROJECT_NOT_TARGETED', 'No targeted project for production run', {
        recovery: 'Call target_project or bind expectedProjectId',
      });
    }
    if (request.project.expectedProjectId && project.projectId !== request.project.expectedProjectId) {
      throw new ProductionRunError('PRODUCTION_RUN_PROJECT_MISMATCH', 'Targeted project does not match expectedProjectId', {
        recovery: 'Target the expected project',
      });
    }

    const policy = mergeProductionPolicy(request.workflow);
    const stages = createInitialStageStates();
    const ts = nowIso();
    const runDraft: ProductionRunV1 = {
      schemaVersion: '1.0.0',
      runId,
      requestId: request.id,
      requestHash,
      revision: 1,
      status: 'active',
      currentStageId: 'intake',
      project: {
        expectedProjectId: request.project.expectedProjectId,
        boundProjectId: project.projectId,
      },
      policy,
      artifacts: [],
      stages,
      workflowFingerprint: '',
      createdAt: ts,
      updatedAt: ts,
    };

    const envelope = writeEnvelope(runDraft, 'intake', 'production-request', request, [], dryRun);
    completeStage(runDraft, 'intake', [{ artifactType: 'production-request', artifactHash: envelope.artifactHash }]);
    const research = getStageState(runDraft, 'research');
    research.status = 'awaiting-input';
    runDraft.currentStageId = 'research';
    runDraft.status = 'awaiting-input';
    runDraft.workflowFingerprint = computeProductionWorkflowFingerprint(runDraft);

    if (dryRun) {
      return {
        dryRun: true,
        run: runDraft,
        runSummary: summarize(runDraft),
        nextAction: planNextAction(runDraft),
        errors: [],
        warnings: validated.warnings,
      };
    }

    if (store.getRun(runId)) {
      throw new ProductionRunError('PRODUCTION_RUN_ALREADY_EXISTS', `Run ${runId} already exists`, {
        runId,
        recovery: 'Use production_run_get / resume',
      });
    }

    return store.withLock(runId, async () => {
      store.writeArtifactEnvelope(runId, envelope);
      store.writeRun(runDraft);
      const receipt: ProductionRunReceiptV1 = {
        requestId: input.requestId,
        inputHash: hash,
        operation: 'create-run',
        runId,
        resultingRevision: runDraft.revision,
        resultingWorkflowFingerprint: runDraft.workflowFingerprint,
        completedAt: nowIso(),
      };
      store.writeReceipt(runId, receipt);
      const event: ProductionRunEventV1 = {
        eventId: computeEventId({ runId, eventType: 'run.created', nextRevision: 1 }),
        runId,
        requestId: input.requestId,
        eventType: 'run.created',
        nextRevision: 1,
        occurredAt: nowIso(),
        details: { requestHash },
      };
      store.appendEvent(runId, event);
      return {
        dryRun: false,
        run: runDraft,
        runSummary: summarize(runDraft),
        nextAction: planNextAction(runDraft),
        receipt,
        errors: [],
        warnings: validated.warnings,
      };
    });
  }

  async function putArtifact(input: PutArtifactInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({
      op: 'put-artifact',
      requestId: input.requestId,
      runId: input.runId,
      artifactType: input.artifactType,
      artifact: input.artifact,
      expectedRevision: input.expectedRevision,
      expectedWorkflowFingerprint: input.expectedWorkflowFingerprint,
    });

    const applyMutation = async (): Promise<OrchestratorResult> => {
      const run = store.getRun(input.runId);
      if (!run && !dryRun) {
        throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${input.runId}`);
      }
      // For dry-run without persisted run, caller must have run from create dry-run in memory — not supported; require persisted for put
      if (!run) {
        throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${input.runId}`, {
          recovery: 'Create the run with dryRun=false first',
        });
      }

      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }

      assertGuard(run, input);
      const request = store.getActiveArtifactContent<ExplainerProductionRequestV1>(run, 'production-request');
      if (!request) {
        throw new ProductionRunError('PRODUCTION_RUN_ARTIFACT_MISSING', 'Missing production-request artifact', { runId: run.runId });
      }

      let stageId: ProductionStageId;
      let envelope: ProductionArtifactEnvelopeV1;
      let warnings: ProductionDiagnostic[] = [];

      if (input.artifactType === 'research-brief') {
        stageId = 'research';
        const result = validateResearchBrief(input.artifact, { productionRequest: request });
        if (!result.valid || !result.normalized) {
          throw new ProductionRunError('PRODUCTION_RESEARCH_INVALID', 'Invalid research brief', {
            diagnostics: result.errors,
            runId: run.runId,
            recovery: 'Fix ResearchBriefV1 sources/claims',
          });
        }
        warnings = result.warnings;
        invalidateDownstreamFromArtifact(run, 'research-brief');
        envelope = writeEnvelope(run, stageId, 'research-brief', result.normalized, [
          run.artifacts.find((a) => a.artifactType === 'production-request')!,
        ].filter(Boolean), dryRun);
        const stage = getStageState(run, stageId);
        stage.inputArtifacts = [{ artifactType: 'production-request', artifactHash: run.requestHash }];
        stage.outputArtifacts = [{ artifactType: 'research-brief', artifactHash: envelope.artifactHash }];
        stage.attempt += 1;
        if (stageRequiresReview(run, stageId)) {
          const review = awaitReview(run, stageId, dryRun);
          bumpRevision(run);
          return finalizeMutation(run, input.requestId, hash, dryRun, 'put-artifact', {
            warnings,
            review,
            eventType: 'stage.awaiting-review',
            stageId,
          });
        }
        completeStage(run, stageId, stage.outputArtifacts);
        getStageState(run, 'script').status = 'awaiting-input';
        run.currentStageId = 'script';
      } else if (input.artifactType === 'explainer-script') {
        stageId = 'script';
        const research = store.getActiveArtifactContent<ResearchBriefV1>(run, 'research-brief');
        if (!research) {
          throw new ProductionRunError('PRODUCTION_RUN_ARTIFACT_MISSING', 'Research brief required', { runId: run.runId });
        }
        const resStage = getStageState(run, 'research');
        if (resStage.status !== 'completed') {
          throw new ProductionRunError('PRODUCTION_RUN_STAGE_DEPENDENCY_INCOMPLETE', 'Research stage not completed/approved', {
            runId: run.runId,
            recovery: 'Approve research review first',
          });
        }
        const result = validateExplainerScript(input.artifact, { productionRequest: request, researchBrief: research });
        if (!result.valid || !result.normalized) {
          throw new ProductionRunError('PRODUCTION_SCRIPT_INVALID', 'Invalid script', {
            diagnostics: result.errors,
            runId: run.runId,
          });
        }
        warnings = result.warnings;
        invalidateDownstreamFromArtifact(run, 'explainer-script');
        const researchRef = run.artifacts.find((a) => a.artifactType === 'research-brief')!;
        envelope = writeEnvelope(run, stageId, 'explainer-script', result.normalized, [researchRef], dryRun);
        const stage = getStageState(run, stageId);
        stage.outputArtifacts = [{ artifactType: 'explainer-script', artifactHash: envelope.artifactHash }];
        stage.attempt += 1;
        if (stageRequiresReview(run, stageId)) {
          const review = awaitReview(run, stageId, dryRun);
          bumpRevision(run);
          return finalizeMutation(run, input.requestId, hash, dryRun, 'put-artifact', {
            warnings,
            review,
            eventType: 'stage.awaiting-review',
            stageId,
          });
        }
        completeStage(run, stageId, stage.outputArtifacts);
        getStageState(run, 'storyboard').status = 'awaiting-input';
        run.currentStageId = 'storyboard';
      } else {
        stageId = 'storyboard';
        const research = store.getActiveArtifactContent<ResearchBriefV1>(run, 'research-brief');
        const script = store.getActiveArtifactContent<ExplainerScriptV1>(run, 'explainer-script');
        if (!script || getStageState(run, 'script').status !== 'completed') {
          throw new ProductionRunError('PRODUCTION_RUN_STAGE_DEPENDENCY_INCOMPLETE', 'Script stage must be completed', { runId: run.runId });
        }
        const result = validateStoryboard(input.artifact, {
          productionRequest: request,
          script,
          researchBrief: research ?? undefined,
        });
        if (!result.valid || !result.normalized) {
          throw new ProductionRunError('PRODUCTION_STORYBOARD_INVALID', 'Invalid storyboard', {
            diagnostics: result.errors,
            runId: run.runId,
          });
        }
        warnings = result.warnings;
        invalidateDownstreamFromArtifact(run, 'storyboard');
        const scriptRef = run.artifacts.find((a) => a.artifactType === 'explainer-script')!;
        envelope = writeEnvelope(run, stageId, 'storyboard', result.normalized, [scriptRef], dryRun);
        const stage = getStageState(run, stageId);
        stage.outputArtifacts = [{ artifactType: 'storyboard', artifactHash: envelope.artifactHash }];
        stage.attempt += 1;
        if (stageRequiresReview(run, stageId)) {
          const review = awaitReview(run, stageId, dryRun);
          bumpRevision(run);
          return finalizeMutation(run, input.requestId, hash, dryRun, 'put-artifact', {
            warnings,
            review,
            eventType: 'stage.awaiting-review',
            stageId,
          });
        }
        completeStage(run, stageId, stage.outputArtifacts);
        getStageState(run, 'asset-requirements').status = 'ready';
        run.currentStageId = 'asset-requirements';
      }

      bumpRevision(run);
      return finalizeMutation(run, input.requestId, hash, dryRun, 'put-artifact', {
        warnings,
        eventType: 'artifact.added',
        stageId,
      });
    };

    if (dryRun) return applyMutation();
    return store.withLock(input.runId, applyMutation);
  }

  async function finalizeMutation(
    run: ProductionRunV1,
    requestId: string,
    hash: string,
    dryRun: boolean,
    operation: ProductionRunReceiptV1['operation'],
    extra: {
      warnings?: ProductionDiagnostic[];
      review?: ProductionReviewV1;
      eventType?: ProductionRunEventV1['eventType'];
      stageId?: ProductionStageId;
      previousRevision?: number;
      previousFingerprint?: string;
      data?: unknown;
    } = {},
  ): Promise<OrchestratorResult> {
    const previousRevision = extra.previousRevision;
    if (dryRun) {
      return {
        dryRun: true,
        run,
        runSummary: summarize(run),
        nextAction: planNextAction(run),
        review: extra.review,
        errors: [],
        warnings: extra.warnings ?? [],
        data: extra.data,
      };
    }
    store.writeRun(run);
    const receipt: ProductionRunReceiptV1 = {
      requestId,
      inputHash: hash,
      operation,
      runId: run.runId,
      previousRevision,
      resultingRevision: run.revision,
      previousWorkflowFingerprint: extra.previousFingerprint,
      resultingWorkflowFingerprint: run.workflowFingerprint,
      completedAt: nowIso(),
    };
    store.writeReceipt(run.runId, receipt);
    if (extra.eventType) {
      store.appendEvent(run.runId, {
        eventId: computeEventId({
          runId: run.runId,
          eventType: extra.eventType,
          nextRevision: run.revision,
          stageId: extra.stageId,
        }),
        runId: run.runId,
        requestId,
        eventType: extra.eventType,
        stageId: extra.stageId,
        previousRevision,
        nextRevision: run.revision,
        occurredAt: nowIso(),
      });
    }
    return {
      dryRun: false,
      run,
      runSummary: summarize(run),
      nextAction: planNextAction(run),
      receipt,
      review: extra.review,
      errors: [],
      warnings: extra.warnings ?? [],
      data: extra.data,
    };
  }

  async function executeStage(input: ExecuteStageInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({
      op: 'execute-stage',
      requestId: input.requestId,
      runId: input.runId,
      stageId: input.stageId,
      editSessionId: input.editSessionId,
      stageInput: input.stageInput,
      expectedRevision: input.expectedRevision,
      expectedWorkflowFingerprint: input.expectedWorkflowFingerprint,
    });

    const apply = async (): Promise<OrchestratorResult> => {
      const run = store.getRun(input.runId);
      if (!run) throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${input.runId}`);
      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }
      assertGuard(run, input);
      const previousRevision = run.revision;
      const previousFingerprint = run.workflowFingerprint;

      const planned = planNextAction(run);
      let stageId = input.stageId;
      if (!stageId) {
        if (planned.type === 'execute-stage') stageId = planned.stageId;
        else if (planned.type === 'open-edit-session') stageId = planned.stageId;
        else {
          throw new ProductionRunError('PRODUCTION_RUN_STAGE_NOT_READY', 'No executable stage; inspect next action', {
            runId: run.runId,
            details: { planned },
            recovery: 'Use production_run_plan_next',
          });
        }
      }

      const stage = getStageState(run, stageId);
      if (stage.attempt >= run.policy.maximumStageRetries && ['failed', 'blocked'].includes(stage.status)) {
        throw new ProductionRunError('PRODUCTION_RUN_STAGE_RETRY_LIMIT', `Retry limit reached for ${stageId}`, {
          runId: run.runId,
          stageId,
        });
      }

      stage.attempt += 1;
      stage.startedAt = nowIso();
      stage.status = 'running';
      run.currentStageId = stageId;

      const request = store.getActiveArtifactContent<ExplainerProductionRequestV1>(run, 'production-request')!;
      const warnings: ProductionDiagnostic[] = [];
      let outputs: { artifactType: ProductionArtifactType; artifactHash: string }[] = [];
      let eventType: ProductionRunEventV1['eventType'] = 'stage.completed';

      try {
        if (stageId === 'asset-requirements') {
          const storyboard = store.getActiveArtifactContent<StoryboardV1>(run, 'storyboard')!;
          const reqSet = storyboardToAssetRequirementSet({ storyboard, productionRequest: request });
          const storyRef = run.artifacts.find((a) => a.artifactType === 'storyboard')!;
          const env = writeEnvelope(run, stageId, 'asset-requirement-set', reqSet, [storyRef], dryRun);
          outputs = [{ artifactType: 'asset-requirement-set', artifactHash: env.artifactHash }];
          completeStage(run, stageId, outputs);
          getStageState(run, 'asset-resolution').status = 'ready';
          run.currentStageId = 'asset-resolution';
        } else if (stageId === 'asset-resolution') {
          const reqSet = store.getActiveArtifactContent(run, 'asset-requirement-set')!;
          const resolved = await adapters.assetResolver.resolve(reqSet as never, {
            allowStaging: run.policy.allowStagingAssets,
          });
          if (resolved.hasDuplicateReview) {
            stage.status = 'blocked';
            stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_ASSET_DUPLICATE_REVIEW_REQUIRED', 'Duplicate asset review required')];
            run.status = 'blocked';
            bumpRevision(run);
            return finalizeMutation(run, input.requestId, hash, dryRun, 'execute-stage', {
              warnings, previousRevision, previousFingerprint, eventType: 'stage.failed', stageId,
            });
          }
          const reqRef = run.artifacts.find((a) => a.artifactType === 'asset-requirement-set')!;
          const env = writeEnvelope(run, stageId, 'asset-plan', resolved.plan, [reqRef], dryRun);
          outputs = [{ artifactType: 'asset-plan', artifactHash: env.artifactHash }];
          completeStage(run, stageId, outputs);
          if (resolved.hasCreationBriefs && run.policy.allowAssetAuthoringTasks) {
            getStageState(run, 'asset-authoring').status = 'awaiting-input';
            run.currentStageId = 'asset-authoring';
            const tasks: MotionAssetAuthoringTaskSetV1 = {
              schemaVersion: '1.0.0',
              tasks: resolved.unresolvedRequired.map((rid) => ({
                taskId: `task.${rid}`,
                requirementId: rid,
                creationBrief: { requirementId: rid },
                status: 'pending',
              })),
            };
            const planRef = run.artifacts.find((a) => a.artifactType === 'asset-plan')!;
            writeEnvelope(run, 'asset-authoring', 'asset-authoring-tasks', tasks, [planRef], dryRun);
            getStageState(run, 'asset-authoring').errors = [
              productionDiagnostic('error', 'PRODUCTION_RUN_ASSET_AUTHORING_REQUIRED', 'Create missing assets then resume', {
                details: { requirementIds: resolved.unresolvedRequired },
              }),
            ];
            eventType = 'stage.awaiting-input';
          } else if (resolved.unresolvedRequired.length) {
            stage.status = 'blocked';
            stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_ASSET_PLAN_INCOMPLETE', 'Unresolved required assets')];
            run.status = 'blocked';
          } else {
            getStageState(run, 'asset-authoring').status = 'skipped';
            getStageState(run, 'scene-composition').status = 'ready';
            run.currentStageId = 'scene-composition';
          }
        } else if (stageId === 'asset-authoring') {
          let tasks = store.getActiveArtifactContent<MotionAssetAuthoringTaskSetV1>(run, 'asset-authoring-tasks');
          if (!tasks) {
            throw new ProductionRunError('PRODUCTION_RUN_ASSET_AUTHORING_INCOMPLETE', 'No authoring tasks', { runId: run.runId });
          }
          tasks = await adapters.motionAuthoring.inspectTasks(tasks);
          const stillPending = tasks.tasks.filter((t) => t.status !== 'published' && t.status !== 'staging');
          const stagingOk = run.policy.allowStagingAssets;
          const incomplete = tasks.tasks.filter((t) => {
            if (t.status === 'published') return false;
            if (t.status === 'staging' && stagingOk) return false;
            return true;
          });
          const planRef = run.artifacts.find((a) => a.artifactType === 'asset-plan')!;
          writeEnvelope(run, stageId, 'asset-authoring-tasks', tasks, [planRef], dryRun);
          if (incomplete.length || stillPending.length) {
            stage.status = 'awaiting-input';
            stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_ASSET_AUTHORING_INCOMPLETE', 'Authoring tasks incomplete')];
            eventType = 'stage.awaiting-input';
          } else {
            // Re-resolve
            const reqSet = store.getActiveArtifactContent(run, 'asset-requirement-set')!;
            const resolved = await adapters.assetResolver.resolve(reqSet as never, {
              allowStaging: run.policy.allowStagingAssets,
            });
            if (resolved.unresolvedRequired.length) {
              stage.status = 'blocked';
              stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_ASSET_PLAN_INCOMPLETE', 'Still unresolved after authoring')];
            } else {
              const env = writeEnvelope(run, stageId, 'asset-plan', resolved.plan, [planRef], dryRun);
              completeStage(run, stageId, [{ artifactType: 'asset-plan', artifactHash: env.artifactHash }]);
              getStageState(run, 'scene-composition').status = 'ready';
              run.currentStageId = 'scene-composition';
            }
          }
        } else if (stageId === 'scene-composition') {
          const storyboard = store.getActiveArtifactContent<StoryboardV1>(run, 'storyboard')!;
          const assetPlan = store.getActiveArtifactContent<AssetPlanV1>(run, 'asset-plan')!;
          // Keep composition specs deterministic (used by lineage tests)
          for (const scene of storyboard.scenes) {
            storyboardSceneToCompositionSpec({
              storyboardScene: scene,
              assetPlan,
              productionRequest: request,
            });
          }
          const set = await adapters.sceneDraft.composeScenes({ storyboard, assetPlan, productionRequest: request });
          const planRef = run.artifacts.find((a) => a.artifactType === 'asset-plan')!;
          const env = writeEnvelope(run, stageId, 'scene-draft-set', set, [planRef], dryRun);
          outputs = [{ artifactType: 'scene-draft-set', artifactHash: env.artifactHash }];
          completeStage(run, stageId, outputs);
          getStageState(run, 'scene-review').status = 'ready';
          run.currentStageId = 'scene-review';
        } else if (stageId === 'scene-review') {
          const set = store.getActiveArtifactContent<SceneDraftSetArtifactV1>(run, 'scene-draft-set')!;
          const report = await adapters.sceneDraft.buildReviewReport(set);
          const setRef = run.artifacts.find((a) => a.artifactType === 'scene-draft-set')!;
          const env = writeEnvelope(run, stageId, 'scene-review-report', report, [setRef], dryRun);
          outputs = [{ artifactType: 'scene-review-report', artifactHash: env.artifactHash }];
          if (stageRequiresReview(run, stageId)) {
            const review = awaitReview(run, stageId, dryRun);
            bumpRevision(run);
            return finalizeMutation(run, input.requestId, hash, dryRun, 'execute-stage', {
              warnings, review, previousRevision, previousFingerprint, eventType: 'stage.awaiting-review', stageId,
            });
          }
          completeStage(run, stageId, outputs);
          getStageState(run, 'video-plan').status = 'ready';
          run.currentStageId = 'video-plan';
        } else if (stageId === 'video-plan') {
          const storyboard = store.getActiveArtifactContent<StoryboardV1>(run, 'storyboard')!;
          const set = store.getActiveArtifactContent<SceneDraftSetArtifactV1>(run, 'scene-draft-set')!;
          const bindings = await adapters.sceneDraft.buildBindings(set);
          const plan = storyboardToVideoPlan({ storyboard, sceneBindings: bindings, productionRequest: request });
          const validation = adapters.videoPlan.validate(plan);
          if (!validation.valid) {
            throw new ProductionRunError('PRODUCTION_RUN_VIDEO_PLAN_INVALID', validation.errors.join('; '), { runId: run.runId });
          }
          const setRef = run.artifacts.find((a) => a.artifactType === 'scene-draft-set')!;
          const env = writeEnvelope(run, stageId, 'video-plan', plan, [setRef], dryRun);
          outputs = [{ artifactType: 'video-plan', artifactHash: env.artifactHash }];
          completeStage(run, stageId, outputs);
          getStageState(run, 'timeline-assembly').status = 'ready';
          run.currentStageId = 'timeline-assembly';
        } else if (stageId === 'timeline-assembly') {
          const editSessionId = input.editSessionId;
          if (!editSessionId) {
            stage.status = 'ready';
            throw new ProductionRunError('PRODUCTION_RUN_EDIT_SESSION_REQUIRED', 'editSessionId required for timeline-assembly', {
              runId: run.runId,
              recovery: 'Open an edit session and pass editSessionId',
            });
          }
          const videoPlan = store.getActiveArtifactContent<VideoPlanV1>(run, 'video-plan')!;
          if (dryRun) {
            await adapters.editSession.assembleVideoPlan({ editSessionId, videoPlan, dryRun: true });
            stage.status = 'ready';
            bumpRevision(run);
            return finalizeMutation(run, input.requestId, hash, true, 'execute-stage', {
              warnings, previousRevision, previousFingerprint, stageId, data: { planned: true },
            });
          }
          if (run.policy.projectMutationApproval === 'manual') {
            const result = await adapters.editSession.assembleVideoPlan({ editSessionId, videoPlan, dryRun: false });
            const planRef = run.artifacts.find((a) => a.artifactType === 'video-plan')!;
            const env = writeEnvelope(run, stageId, 'video-assembly-report', result.report, [planRef], false);
            stage.externalOperation = { type: 'edit-session', id: editSessionId, status: 'pending-review' };
            stage.status = 'awaiting-project-session';
            stage.outputArtifacts = [{ artifactType: 'video-assembly-report', artifactHash: env.artifactHash }];
            eventType = 'stage.awaiting-project-session';
          } else {
            const result = await adapters.editSession.assembleVideoPlan({ editSessionId, videoPlan, dryRun: false });
            const status = await adapters.editSession.getStatus(editSessionId);
            if (status.status !== 'applied' && !result.applied) {
              stage.externalOperation = { type: 'edit-session', id: editSessionId, status: status.status };
              stage.status = 'awaiting-project-session';
              eventType = 'stage.awaiting-project-session';
            } else {
              const planRef = run.artifacts.find((a) => a.artifactType === 'video-plan')!;
              const env = writeEnvelope(run, stageId, 'video-assembly-report', result.report, [planRef], false);
              completeStage(run, stageId, [{ artifactType: 'video-assembly-report', artifactHash: env.artifactHash }]);
              getStageState(run, 'narration-plan').status = 'ready';
              run.currentStageId = 'narration-plan';
            }
          }
        } else if (stageId === 'narration-plan') {
          const speakers = (input.stageInput?.speakers ?? []) as NarrationSpeakerV1[];
          if (!speakers.length) {
            stage.status = 'awaiting-input';
            stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_NARRATION_CONFIG_MISSING', 'Speaker configuration required')];
            eventType = 'stage.awaiting-input';
          } else {
            const script = store.getActiveArtifactContent<ExplainerScriptV1>(run, 'explainer-script')!;
            const storyboard = store.getActiveArtifactContent<StoryboardV1>(run, 'storyboard')!;
            const videoPlan = store.getActiveArtifactContent<VideoPlanV1>(run, 'video-plan')!;
            const plan = scriptToNarrationPlan({
              script, storyboard, videoPlan, productionRequest: request, speakerConfiguration: speakers,
            });
            const vpRef = run.artifacts.find((a) => a.artifactType === 'video-plan')!;
            const env = writeEnvelope(run, stageId, 'narration-plan', plan, [vpRef], dryRun);
            completeStage(run, stageId, [{ artifactType: 'narration-plan', artifactHash: env.artifactHash }]);
            getStageState(run, 'narration-timing').status = 'ready';
            run.currentStageId = 'narration-timing';
          }
        } else if (stageId === 'narration-timing') {
          if (!run.policy.allowTemporaryTts && run.policy.requireFinalVoiceover) {
            throw new ProductionRunError('PRODUCTION_RUN_NARRATION_CONFIG_MISSING', 'Final voice-over required', { runId: run.runId });
          }
          const narrationPlan = store.getActiveArtifactContent<NarrationPlanV1>(run, 'narration-plan')!;
          const existing = stage.externalOperation?.id;
          const prep = await adapters.narration.prepareTts({
            narrationPlan,
            dryRun,
            existingOperationId: existing,
          });
          if (dryRun) {
            stage.status = 'ready';
            bumpRevision(run);
            return finalizeMutation(run, input.requestId, hash, true, 'execute-stage', {
              previousRevision, previousFingerprint, stageId, data: { operationId: prep.operationId },
            });
          }
          stage.externalOperation = { type: 'tts', id: prep.operationId, status: prep.status };
          if (prep.status === 'completed' && prep.timing) {
            const npRef = run.artifacts.find((a) => a.artifactType === 'narration-plan')!;
            const env = writeEnvelope(run, stageId, 'narration-timing', prep.timing, [npRef], false);
            completeStage(run, stageId, [{ artifactType: 'narration-timing', artifactHash: env.artifactHash }]);
            getStageState(run, 'narration-application').status = 'ready';
            run.currentStageId = 'narration-application';
          } else {
            stage.status = 'awaiting-external-operation';
            eventType = 'stage.awaiting-external-operation';
          }
        } else if (stageId === 'narration-application') {
          const editSessionId = input.editSessionId;
          if (!editSessionId) {
            throw new ProductionRunError('PRODUCTION_RUN_EDIT_SESSION_REQUIRED', 'editSessionId required', { runId: run.runId });
          }
          const narrationPlan = store.getActiveArtifactContent<NarrationPlanV1>(run, 'narration-plan')!;
          const timing = store.getActiveArtifactContent(run, 'narration-timing');
          if (dryRun) {
            await adapters.editSession.applyNarration({ editSessionId, narrationPlan, timing, dryRun: true });
            stage.status = 'ready';
            bumpRevision(run);
            return finalizeMutation(run, input.requestId, hash, true, 'execute-stage', {
              previousRevision, previousFingerprint, stageId,
            });
          }
          const result = await adapters.editSession.applyNarration({
            editSessionId, narrationPlan, timing, dryRun: false,
          });
          const timingRef = run.artifacts.find((a) => a.artifactType === 'narration-timing')!;
          const env = writeEnvelope(run, stageId, 'narration-application-report', result.report, [timingRef], false);
          if (run.policy.projectMutationApproval === 'manual') {
            stage.externalOperation = { type: 'edit-session', id: editSessionId, status: 'pending-review' };
            stage.status = 'awaiting-project-session';
            stage.outputArtifacts = [{ artifactType: 'narration-application-report', artifactHash: env.artifactHash }];
            eventType = 'stage.awaiting-project-session';
          } else {
            completeStage(run, stageId, [{ artifactType: 'narration-application-report', artifactHash: env.artifactHash }]);
            getStageState(run, 'timeline-review').status = 'ready';
            run.currentStageId = 'timeline-review';
          }
        } else if (stageId === 'timeline-review') {
          const report = {
            ok: true,
            captions: run.policy.requireCaptions,
            audioReady: true,
          };
          // reuse narration-application-report as review ref if present
          if (stageRequiresReview(run, stageId)) {
            // ensure artifact ref for review
            const existing = run.artifacts.find((a) => a.artifactType === 'narration-application-report');
            if (!existing) {
              const env = writeEnvelope(run, stageId, 'narration-application-report', report, [], dryRun);
              outputs = [{ artifactType: 'narration-application-report', artifactHash: env.artifactHash }];
            }
            const review = awaitReview(run, stageId, dryRun);
            bumpRevision(run);
            return finalizeMutation(run, input.requestId, hash, dryRun, 'execute-stage', {
              review, previousRevision, previousFingerprint, eventType: 'stage.awaiting-review', stageId,
            });
          }
          completeStage(run, stageId, outputs);
          getStageState(run, 'production-preflight').status = 'ready';
          run.currentStageId = 'production-preflight';
        } else if (stageId === 'production-preflight') {
          const prepared = await adapters.productionRender.prepare({
            productionRequest: request,
            projectId: run.project.boundProjectId!,
            dryRun,
          });
          const env = writeEnvelope(run, stageId, 'production-render-plan', prepared.plan, [], dryRun);
          completeStage(run, stageId, [{ artifactType: 'production-render-plan', artifactHash: env.artifactHash }]);
          getStageState(run, 'production-render').status = 'ready';
          run.currentStageId = 'production-render';
        } else if (stageId === 'production-render') {
          const plan = store.getActiveArtifactContent(run, 'production-render-plan');
          const existing = stage.externalOperation?.id;
          const submitted = await adapters.productionRender.submit({
            requestId: `render.${run.runId}`,
            plan,
            projectId: run.project.boundProjectId!,
            dryRun,
            existingOperationId: existing,
          });
          if (dryRun) {
            stage.status = 'ready';
            bumpRevision(run);
            return finalizeMutation(run, input.requestId, hash, true, 'execute-stage', {
              previousRevision, previousFingerprint, stageId, data: submitted,
            });
          }
          const env = writeEnvelope(run, stageId, 'production-render-operation', submitted, [], false);
          stage.externalOperation = {
            type: 'production-render',
            id: submitted.operationId,
            status: submitted.status,
          };
          stage.outputArtifacts = [{ artifactType: 'production-render-operation', artifactHash: env.artifactHash }];
          if (submitted.status === 'completed') {
            const status = await adapters.productionRender.getStatus(submitted.operationId);
            if (status.bundleId) {
              const manifest = { bundleId: status.bundleId, manifestHash: status.manifestHash };
              const mEnv = writeEnvelope(run, stageId, 'delivery-bundle-manifest', manifest, [env].map((e) => ({
                artifactType: e.artifactType, artifactHash: e.artifactHash,
              })), false);
              completeStage(run, stageId, [
                { artifactType: 'production-render-operation', artifactHash: env.artifactHash },
                { artifactType: 'delivery-bundle-manifest', artifactHash: mEnv.artifactHash },
              ]);
              getStageState(run, 'delivery-validation').status = 'ready';
              run.currentStageId = 'delivery-validation';
            }
          } else {
            stage.status = 'awaiting-external-operation';
            eventType = 'stage.awaiting-external-operation';
          }
        } else if (stageId === 'delivery-validation') {
          const manifest = store.getActiveArtifactContent<{ bundleId: string }>(run, 'delivery-bundle-manifest');
          if (!manifest?.bundleId) {
            throw new ProductionRunError('PRODUCTION_RUN_DELIVERY_INVALID', 'Missing delivery manifest', { runId: run.runId });
          }
          const validation = await adapters.productionRender.validateBundle(manifest.bundleId);
          if (!validation.valid) {
            stage.status = 'blocked';
            stage.errors = validation.errors.map((message) => productionDiagnostic('error', 'PRODUCTION_RUN_DELIVERY_INVALID', message));
            run.status = 'blocked';
            eventType = 'stage.failed';
          } else {
            const report = {
              valid: true,
              qaStatus: validation.qaStatus,
              artifacts: validation.artifacts,
              manifestHash: validation.manifestHash,
            };
            const mRef = run.artifacts.find((a) => a.artifactType === 'delivery-bundle-manifest')!;
            const env = writeEnvelope(run, stageId, 'delivery-validation-report', report, [mRef], dryRun);
            completeStage(run, stageId, [{ artifactType: 'delivery-validation-report', artifactHash: env.artifactHash }]);
            getStageState(run, 'delivery-review').status = 'ready';
            run.currentStageId = 'delivery-review';
          }
        } else if (stageId === 'delivery-review') {
          if (stageRequiresReview(run, stageId) || run.policy.reviewMode !== 'auto') {
            const review = awaitReview(run, stageId, dryRun);
            bumpRevision(run);
            return finalizeMutation(run, input.requestId, hash, dryRun, 'execute-stage', {
              review, previousRevision, previousFingerprint, eventType: 'stage.awaiting-review', stageId,
            });
          }
          completeStage(run, stageId, []);
          getStageState(run, 'completion').status = 'ready';
          run.currentStageId = 'completion';
        } else if (stageId === 'completion') {
          const manifest = store.getActiveArtifactContent<{ bundleId: string; manifestHash?: string }>(run, 'delivery-bundle-manifest');
          const report = store.getActiveArtifactContent<{ valid: boolean; qaStatus?: string; manifestHash?: string }>(run, 'delivery-validation-report');
          if (!manifest?.bundleId || !report?.valid) {
            throw new ProductionRunError('PRODUCTION_RUN_DELIVERY_INVALID', 'Cannot complete without valid delivery', { runId: run.runId });
          }
          const deliveryReview = getStageState(run, 'delivery-review');
          if (deliveryReview.status !== 'completed' && deliveryReview.status !== 'skipped') {
            throw new ProductionRunError('PRODUCTION_RUN_DELIVERY_REVIEW_REQUIRED', 'Delivery review required', { runId: run.runId });
          }
          run.delivery = {
            bundleId: manifest.bundleId,
            manifestHash: report.manifestHash ?? manifest.manifestHash ?? 'unknown',
            validationStatus: 'valid',
          };
          completeStage(run, stageId, []);
          run.status = 'completed';
          eventType = 'run.completed';
        } else {
          throw new ProductionRunError('PRODUCTION_RUN_STAGE_NOT_READY', `Stage ${stageId} is not executable here`, {
            runId: run.runId,
            stageId,
          });
        }
      } catch (error) {
        if (error instanceof ProductionRunError) {
          stage.status = 'failed';
          stage.errors = error.diagnostics;
          run.status = 'failed';
          bumpRevision(run);
          return finalizeMutation(run, input.requestId, hash, dryRun, 'execute-stage', {
            previousRevision, previousFingerprint, eventType: 'stage.failed', stageId,
            data: { error: error.code },
          });
        }
        throw error;
      }

      if (stage.status === 'running') {
        // completed via completeStage
      }
      bumpRevision(run);
      return finalizeMutation(run, input.requestId, hash, dryRun, 'execute-stage', {
        warnings, previousRevision, previousFingerprint, eventType, stageId,
      });
    };

    if (dryRun) return apply();
    return store.withLock(input.runId, apply);
  }

  async function reviewStage(input: ReviewStageInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({
      op: 'review-stage',
      requestId: input.requestId,
      runId: input.runId,
      reviewId: input.reviewId,
      decision: input.decision,
      notes: input.notes,
      requestedChanges: input.requestedChanges,
      expectedRevision: input.expectedRevision,
      expectedWorkflowFingerprint: input.expectedWorkflowFingerprint,
    });

    const apply = async (): Promise<OrchestratorResult> => {
      const run = store.getRun(input.runId);
      if (!run) throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${input.runId}`);
      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }
      assertGuard(run, input);
      const previousRevision = run.revision;
      const previousFingerprint = run.workflowFingerprint;
      const review = store.getReview(input.runId, input.reviewId);
      if (!review && !dryRun) {
        throw new ProductionRunError('PRODUCTION_RUN_REVIEW_NOT_FOUND', `Review not found: ${input.reviewId}`);
      }
      const activeReview = review ?? {
        schemaVersion: '1.0.0' as const,
        reviewId: input.reviewId,
        runId: input.runId,
        stageId: run.currentStageId,
        artifactReferences: findActiveReviewArtifactRefs(run, run.currentStageId),
        status: 'pending' as const,
        createdAt: nowIso(),
      };

      // Verify artifact hashes still match
      for (const ref of activeReview.artifactReferences) {
        const current = run.artifacts.find((a) => a.artifactType === ref.artifactType);
        if (!current || current.artifactHash !== ref.artifactHash) {
          throw new ProductionRunError('PRODUCTION_RUN_REVIEW_ARTIFACT_CHANGED', 'Reviewed artifacts changed', {
            runId: run.runId,
            recovery: 'Re-run stage and create a new review',
          });
        }
      }

      const stage = getStageState(run, activeReview.stageId);
      if (input.decision === 'reject') {
        activeReview.status = 'rejected';
        activeReview.decision = { notes: input.notes, requestedChanges: input.requestedChanges };
        activeReview.decidedAt = nowIso();
        stage.review = { reviewId: activeReview.reviewId, status: 'rejected' };
        stage.status = 'awaiting-input';
        stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_REVIEW_REJECTED', 'Review rejected', {
          reviewId: activeReview.reviewId,
        })];
        if (!dryRun) store.writeReview(run.runId, activeReview);
        bumpRevision(run);
        return finalizeMutation(run, input.requestId, hash, dryRun, 'review-stage', {
          review: activeReview, previousRevision, previousFingerprint, eventType: 'review.rejected', stageId: stage.stageId,
        });
      }

      activeReview.status = 'approved';
      activeReview.decision = { notes: input.notes };
      activeReview.decidedAt = nowIso();
      stage.review = { reviewId: activeReview.reviewId, status: 'approved' };
      completeStage(run, stage.stageId, stage.outputArtifacts.length ? stage.outputArtifacts : findActiveReviewArtifactRefs(run, stage.stageId));
      // advance next
      const order: ProductionStageId[] = [
        'research', 'script', 'storyboard', 'scene-review', 'timeline-review', 'delivery-review',
      ];
      if (stage.stageId === 'research') {
        getStageState(run, 'script').status = 'awaiting-input';
        run.currentStageId = 'script';
      } else if (stage.stageId === 'script') {
        getStageState(run, 'storyboard').status = 'awaiting-input';
        run.currentStageId = 'storyboard';
      } else if (stage.stageId === 'storyboard') {
        getStageState(run, 'asset-requirements').status = 'ready';
        run.currentStageId = 'asset-requirements';
      } else if (stage.stageId === 'scene-review') {
        getStageState(run, 'video-plan').status = 'ready';
        run.currentStageId = 'video-plan';
      } else if (stage.stageId === 'timeline-review') {
        getStageState(run, 'production-preflight').status = 'ready';
        run.currentStageId = 'production-preflight';
      } else if (stage.stageId === 'delivery-review') {
        getStageState(run, 'completion').status = 'ready';
        run.currentStageId = 'completion';
      } else if (!order.includes(stage.stageId)) {
        // generic: leave planner
      }

      if (!dryRun) store.writeReview(run.runId, activeReview);
      bumpRevision(run);
      return finalizeMutation(run, input.requestId, hash, dryRun, 'review-stage', {
        review: activeReview, previousRevision, previousFingerprint, eventType: 'review.approved', stageId: stage.stageId,
      });
    };

    if (dryRun) return apply();
    return store.withLock(input.runId, apply);
  }

  async function resumeRun(input: ResumeRunInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({
      op: 'resume-run',
      requestId: input.requestId,
      runId: input.runId,
      expectedRevision: input.expectedRevision,
      expectedWorkflowFingerprint: input.expectedWorkflowFingerprint,
    });

    const apply = async (): Promise<OrchestratorResult> => {
      const run = store.getRun(input.runId);
      if (!run) throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${input.runId}`);
      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }
      assertGuard(run, input);
      const previousRevision = run.revision;
      const previousFingerprint = run.workflowFingerprint;
      const stage = getStageState(run, run.currentStageId);

      if (stage.status === 'awaiting-project-session' && stage.externalOperation?.type === 'edit-session') {
        const status = await adapters.editSession.getStatus(stage.externalOperation.id);
        stage.externalOperation.status = status.status;
        if (status.status === 'applied') {
          completeStage(run, stage.stageId, stage.outputArtifacts);
          if (stage.stageId === 'timeline-assembly') {
            getStageState(run, 'narration-plan').status = 'ready';
            run.currentStageId = 'narration-plan';
          } else if (stage.stageId === 'narration-application') {
            getStageState(run, 'timeline-review').status = 'ready';
            run.currentStageId = 'timeline-review';
          }
        } else if (status.status === 'rejected') {
          stage.status = 'blocked';
          stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_EDIT_SESSION_REJECTED', 'Edit session rejected')];
        } else if (status.status === 'discarded') {
          stage.status = 'blocked';
          stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_EDIT_SESSION_DISCARDED', 'Edit session discarded')];
        } else if (status.status === 'stale' || status.status === 'failed') {
          stage.status = 'failed';
          stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_EDIT_SESSION_STALE', `Edit session ${status.status}`)];
        }
      } else if (stage.status === 'awaiting-external-operation' && stage.externalOperation?.type === 'tts') {
        const status = await adapters.narration.getTtsStatus(stage.externalOperation.id);
        stage.externalOperation.status = status.status;
        if (status.status === 'completed') {
          const timing = await adapters.narration.resolveTiming(stage.externalOperation.id);
          const npRef = run.artifacts.find((a) => a.artifactType === 'narration-plan')!;
          const env = writeEnvelope(run, stage.stageId, 'narration-timing', timing, [npRef], dryRun);
          completeStage(run, stage.stageId, [{ artifactType: 'narration-timing', artifactHash: env.artifactHash }]);
          getStageState(run, 'narration-application').status = 'ready';
          run.currentStageId = 'narration-application';
        } else if (status.status === 'failed') {
          stage.status = 'failed';
          stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_TTS_OPERATION_FAILED', 'TTS operation failed')];
        }
      } else if (stage.status === 'awaiting-external-operation' && stage.externalOperation?.type === 'production-render') {
        const status = await adapters.productionRender.getStatus(stage.externalOperation.id);
        stage.externalOperation.status = status.status;
        if (status.status === 'completed' && status.bundleId) {
          const manifest = { bundleId: status.bundleId, manifestHash: status.manifestHash };
          const opRef = run.artifacts.find((a) => a.artifactType === 'production-render-operation');
          const env = writeEnvelope(
            run,
            stage.stageId,
            'delivery-bundle-manifest',
            manifest,
            opRef ? [opRef] : [],
            dryRun,
          );
          completeStage(run, stage.stageId, [
            ...(opRef ? [opRef] : []),
            { artifactType: 'delivery-bundle-manifest', artifactHash: env.artifactHash },
          ]);
          getStageState(run, 'delivery-validation').status = 'ready';
          run.currentStageId = 'delivery-validation';
        } else if (status.status === 'failed') {
          stage.status = 'failed';
          stage.errors = [productionDiagnostic('error', 'PRODUCTION_RUN_RENDER_OPERATION_FAILED', 'Render failed')];
        }
      } else if (stage.status === 'awaiting-input' && stage.stageId === 'asset-authoring') {
        // Re-execute authoring check path by flipping to ready for execute
        stage.status = 'ready';
      }

      bumpRevision(run);
      return finalizeMutation(run, input.requestId, hash, dryRun, 'resume-run', {
        previousRevision, previousFingerprint, eventType: 'run.resumed', stageId: stage.stageId,
      });
    };

    if (dryRun) return apply();
    return store.withLock(input.runId, apply);
  }

  async function cancelRun(input: CancelRunInput): Promise<OrchestratorResult> {
    const dryRun = input.dryRun !== false;
    const hash = inputHash({
      op: 'cancel-run',
      requestId: input.requestId,
      runId: input.runId,
      reason: input.reason,
      expectedRevision: input.expectedRevision,
      expectedWorkflowFingerprint: input.expectedWorkflowFingerprint,
    });

    const apply = async (): Promise<OrchestratorResult> => {
      const run = store.getRun(input.runId);
      if (!run) throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${input.runId}`);
      if (!dryRun) {
        const replay = await replayOrConflict(input.runId, input.requestId, hash);
        if (replay) return replay;
      }
      assertGuard(run, input);
      const previousRevision = run.revision;
      const previousFingerprint = run.workflowFingerprint;
      let cancelAttempted = false;
      const stage = getStageState(run, run.currentStageId);
      if (stage.externalOperation?.type === 'production-render' && adapters.productionRender.cancel) {
        if (!dryRun) {
          await adapters.productionRender.cancel(stage.externalOperation.id);
          cancelAttempted = true;
        } else {
          cancelAttempted = true;
        }
      }
      run.status = 'cancelled';
      stage.status = 'cancelled';
      bumpRevision(run);
      const result = await finalizeMutation(run, input.requestId, hash, dryRun, 'cancel-run', {
        previousRevision, previousFingerprint, eventType: 'run.cancelled', stageId: stage.stageId,
        data: {
          cancelled: true,
          externalCancelAttempted: cancelAttempted,
          appliedProjectMutationsRetained: true,
          artifactsRetained: true,
          completedBundlesRetained: true,
          reason: input.reason,
        },
      });
      return result;
    };

    if (dryRun) return apply();
    return store.withLock(input.runId, apply);
  }

  function validateRun(runId: string): ProductionRunValidationResultV1 {
    const run = store.getRun(runId);
    if (!run) {
      throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${runId}`);
    }
    const errors: ProductionDiagnostic[] = [];
    const warnings: ProductionDiagnostic[] = [];
    const expectedFp = computeProductionWorkflowFingerprint(run);
    const workflowFingerprintValid = expectedFp === run.workflowFingerprint;
    if (!workflowFingerprintValid) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_RUN_FINGERPRINT_CONFLICT', 'Stored fingerprint mismatch'));
    }
    const artifactChecks = run.artifacts.map((ref) => {
      const env = store.getArtifact(runId, ref.artifactType, ref.artifactHash);
      const exists = Boolean(env);
      const hashValid = exists
        ? store.computeArtifactHash(ref.artifactType, env!.content) === ref.artifactHash
        : false;
      if (!exists) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RUN_ARTIFACT_MISSING', `Missing ${ref.artifactType}`, {
          artifactType: ref.artifactType,
          artifactHash: ref.artifactHash,
        }));
      } else if (!hashValid) {
        errors.push(productionDiagnostic('error', 'PRODUCTION_RUN_ARTIFACT_HASH_INVALID', `Hash mismatch ${ref.artifactType}`));
      }
      return {
        artifactType: ref.artifactType,
        artifactHash: ref.artifactHash,
        exists,
        hashValid,
        schemaValid: exists,
      };
    });

    const externalOperationChecks: ProductionRunValidationResultV1['externalOperationChecks'] = [];
    for (const stage of run.stages) {
      if (stage.externalOperation) {
        externalOperationChecks.push({
          type: stage.externalOperation.type,
          id: stage.externalOperation.id,
          status: stage.externalOperation.status ?? 'unknown',
        });
      }
    }

    if (run.status === 'completed' && !run.delivery) {
      errors.push(productionDiagnostic('error', 'PRODUCTION_RUN_DELIVERY_INVALID', 'Completed run missing delivery'));
    }

    return {
      valid: errors.length === 0,
      runId: run.runId,
      revision: run.revision,
      workflowFingerprintValid,
      artifactChecks,
      externalOperationChecks,
      errors,
      warnings,
    };
  }

  async function getDelivery(runId: string): Promise<{
    completed: boolean;
    delivery?: ProductionRunDeliverySummaryV1;
    errors: ProductionDiagnostic[];
    warnings: ProductionDiagnostic[];
  }> {
    const run = store.getRun(runId);
    if (!run) {
      throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${runId}`);
    }
    if (!run.delivery) {
      return {
        completed: false,
        errors: [productionDiagnostic('error', 'PRODUCTION_RUN_DELIVERY_INVALID', 'Delivery not complete')],
        warnings: [],
      };
    }
    const validation = await adapters.productionRender.validateBundle(run.delivery.bundleId);
    return {
      completed: run.status === 'completed',
      delivery: {
        runId: run.runId,
        bundleId: run.delivery.bundleId,
        manifestHash: run.delivery.manifestHash,
        artifacts: validation.artifacts ?? [],
        qaStatus: (validation.qaStatus === 'passed-with-warnings' ? 'passed-with-warnings' : 'passed'),
      },
      errors: [],
      warnings: [],
    };
  }

  function getContract(format: 'summary' | 'full' = 'summary') {
    const summary = {
      schemaVersion: '1.0.0',
      stages: Object.keys(STAGE_DESCRIPTORS),
      artifactTypes: [
        'production-request', 'research-brief', 'explainer-script', 'storyboard',
        'asset-requirement-set', 'asset-plan', 'scene-draft-set', 'video-plan',
        'narration-plan', 'production-render-plan', 'delivery-bundle-manifest',
      ],
      tools: [
        'explainer_orchestrator_get_contract',
        'production_run_create',
        'production_run_list',
        'production_run_get',
        'production_run_validate',
        'production_run_put_artifact',
        'production_run_plan_next',
        'production_run_execute_stage',
        'production_run_review',
        'production_run_resume',
        'production_run_cancel',
        'production_run_get_delivery',
      ],
      limitations: [
        'No built-in Internet research',
        'No built-in LLM script/storyboard generation',
        'Publishing/upload is M6B (`publishing_*` tools), separate from production runs',
        'Caller authors research/script/storyboard artifacts',
        'Project mutations require edit sessions',
      ],
      dryRunDefault: true,
      projectMode: 'existing-target',
    };
    if (format === 'summary') return summary;
    return {
      ...summary,
      policyDefaults: mergeProductionPolicy(),
      stageDescriptors: STAGE_DESCRIPTORS,
      storage: {
        env: 'BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT',
        defaultRelative: '~/.openchatcut/better-chat-cut/production-runs',
      },
    };
  }

  return {
    store,
    adapters,
    getContract,
    createRun,
    putArtifact,
    executeStage,
    reviewStage,
    resumeRun,
    cancelRun,
    validateRun,
    getDelivery,
    planNext: (runId: string) => {
      const run = store.getRun(runId);
      if (!run) throw new ProductionRunError('PRODUCTION_RUN_NOT_FOUND', `Run not found: ${runId}`);
      return planNextAction(run);
    },
    getRun: (runId: string) => store.getRun(runId),
    listRuns: (opts?: { status?: string[]; limit?: number; offset?: number }) => store.listRuns(opts),
    listEvents: (runId: string) => store.listEvents(runId),
  };
}

export type ProductionOrchestrator = ReturnType<typeof createProductionOrchestrator>;
