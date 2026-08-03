import { access, mkdir, readdir, readFile } from 'node:fs/promises';
import {
  BASIC_EXPLAINER_SCENE,
  createScenePreviewService,
  createSceneValidator,
  type SceneDocumentV1,
} from '../../../scene-graph/src/index.ts';
import {
  createBatchAssetResolver,
} from '../../../asset-resolver/src/index.ts';
import {
  createGlobalAssetRegistry,
  resolveAssetCatalogRootDescriptors,
} from '../../../global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../global-asset-registry/src/asset-registry.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../motion-components/src/index.ts';
import {
  MAX_SCENE_DRAFT_HISTORY_ENTRIES,
  SCENE_DRAFT_SCHEMA_VERSION,
  type ApplySceneDraftPatchInput,
  type ComposeSceneDraftFromAssetPlanInput,
  type CreateSceneDraftInput,
  type RenderSceneDraftPreviewInput,
  type SceneDraftCreateResultV1,
  type SceneDraftDetailV1,
  type SceneDraftHistoryDryRunResultV1,
  type SceneDraftHistoryMutationInput,
  type SceneDraftMutationResultV1,
  type SceneDraftPatchResultV1,
  type SceneDraftSummaryV1,
  type SceneDraftValidationResultV1,
} from '../contracts/scene-draft.ts';
import type { SceneDraftRecordV1 } from '../contracts/scene-draft-record.ts';
import type { SceneDraftHistoryEntryV1 } from '../contracts/scene-draft-history.ts';
import type { SceneDraftOperationReceiptV1 } from '../contracts/scene-draft-receipt.ts';
import type { SceneDraftEventV1 } from '../contracts/scene-draft-event.ts';
import { SceneDraftError, type SceneDraftDiagnostic } from '../contracts/scene-draft-errors.ts';
import { composeSceneFromAssetPlan } from '../composition/asset-plan-scene-composer.ts';
import { applyScenePatch } from '../commands/apply-scene-patch.ts';
import { assertSafeDraftId, assertSafeRequestId, validateCreateDraftInput } from '../schema/draft-validator.ts';
import { computeInputHash } from '../schema/patch-serialization.ts';
import { assertSceneDraftRootAvailable, resolveSceneDraftRoot } from '../storage/scene-draft-root.ts';
import { resolveSceneDraftPaths, type SceneDraftPaths } from '../storage/scene-draft-paths.ts';
import { withSceneDraftLock } from '../storage/scene-draft-lock.ts';
import { atomicWriteJson } from '../storage/scene-draft-atomic-write.ts';
import { assertReceiptReplayOrConflict, writeReceipt } from '../storage/scene-draft-receipts.ts';
import { appendSceneDraftEvent } from '../storage/scene-draft-journal.ts';
import { computeHistoryEntryId, readHistoryEntry, writeHistoryEntry } from '../storage/scene-draft-history-store.ts';

ensureBetterChatCutMotionRuntime();

function nowIso(): string {
  return new Date().toISOString();
}

function toSummary(record: SceneDraftRecordV1, scene: SceneDocumentV1): SceneDraftSummaryV1 {
  return {
    draftId: record.draftId,
    name: record.name,
    description: record.description,
    revision: record.revision,
    sceneId: record.sceneId,
    sceneContentHash: record.sceneContentHash,
    nodeCount: scene.nodes.length,
    durationInFrames: scene.durationInFrames,
    fps: scene.fps,
    canUndo: record.historyCursor > 0,
    canRedo: record.historyCursor < record.historyEntryIds.length - 1,
    sourceAssetPlan: record.sourceAssetPlan
      ? { planId: record.sourceAssetPlan.planId, planHash: record.sourceAssetPlan.planHash }
      : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export type SceneDraftServiceOptions = {
  root?: string;
  registry?: GlobalAssetRegistryWithRecords;
  resolver?: ReturnType<typeof createBatchAssetResolver>;
};

export interface SceneDraftStore {
  list(options?: { limit?: number; offset?: number }): Promise<{
    total: number;
    offset: number;
    limit: number;
    items: SceneDraftSummaryV1[];
  }>;
  get(draftId: string, options?: { includeHistory?: boolean }): Promise<SceneDraftDetailV1 | undefined>;
  create(input: CreateSceneDraftInput): Promise<SceneDraftCreateResultV1>;
  composeFromAssetPlan(input: ComposeSceneDraftFromAssetPlanInput): Promise<SceneDraftCreateResultV1>;
  applyPatch(input: ApplySceneDraftPatchInput): Promise<SceneDraftPatchResultV1>;
  undo(input: SceneDraftHistoryMutationInput): Promise<SceneDraftMutationResultV1 | SceneDraftHistoryDryRunResultV1>;
  redo(input: SceneDraftHistoryMutationInput): Promise<SceneDraftMutationResultV1 | SceneDraftHistoryDryRunResultV1>;
  validate(draftId: string, options?: {
    historyEntryId?: string;
    analyzeLayout?: boolean;
    analysisFrames?: number[];
  }): Promise<SceneDraftValidationResultV1>;
  renderPreview(input: RenderSceneDraftPreviewInput): Promise<unknown>;
  getContract(format?: 'summary' | 'full'): unknown;
  createBindingPayload(input: {
    draftId: string;
    historyEntryId?: string;
  }): Promise<{
    draftId: string;
    draftRevision: number;
    historyEntryId: string;
    sceneContentHash: string;
    scene: import('../../../scene-graph/src/contracts/scene-document.ts').SceneDocumentV1;
    sourceAssetPlan?: import('../contracts/asset-plan-binding.ts').SceneDraftAssetPlanReferenceV1;
  }>;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readRecord(paths: SceneDraftPaths): Promise<SceneDraftRecordV1 | undefined> {
  if (!(await pathExists(paths.draftJson))) return undefined;
  const raw = await readFile(paths.draftJson, 'utf8');
  return JSON.parse(raw) as SceneDraftRecordV1;
}

export function createSceneDraftService(options: SceneDraftServiceOptions = {}): SceneDraftStore {
  const root = assertSceneDraftRootAvailable(options.root ?? resolveSceneDraftRoot());
  let registryPromise: Promise<GlobalAssetRegistryWithRecords> | null = options.registry
    ? Promise.resolve(options.registry)
    : null;
  let resolverPromise: Promise<ReturnType<typeof createBatchAssetResolver>> | null = options.resolver
    ? Promise.resolve(options.resolver)
    : null;

  async function getRegistry(): Promise<GlobalAssetRegistryWithRecords> {
    if (!registryPromise) {
      registryPromise = (async () => {
        const registry = createGlobalAssetRegistry({
          roots: resolveAssetCatalogRootDescriptors(),
          strict: false,
        });
        await registry.refresh();
        return registry;
      })();
    }
    return registryPromise;
  }

  async function getResolver() {
    if (!resolverPromise) {
      resolverPromise = (async () => {
        const registry = await getRegistry();
        return createBatchAssetResolver({ registry });
      })();
    }
    return resolverPromise;
  }

  async function validateScene(scene: SceneDocumentV1) {
    const validator = createSceneValidator();
    return validator.validate(scene, {
      includeNormalizedScene: true,
      includeDependencies: true,
      analyzeLayout: false,
    });
  }

  function assertGuards(record: SceneDraftRecordV1, expectedRevision: number, expectedHash: string): void {
    if (record.revision !== expectedRevision) {
      throw new SceneDraftError('SCENE_DRAFT_REVISION_CONFLICT', 'expectedRevision does not match current draft revision', {
        recovery: 'Call scene_draft_get, rebase, dry-run, then apply',
        details: { expectedRevision, actualRevision: record.revision },
      });
    }
    if (record.sceneContentHash !== expectedHash) {
      throw new SceneDraftError('SCENE_DRAFT_CONTENT_CONFLICT', 'expectedSceneContentHash does not match current scene', {
        recovery: 'Call scene_draft_get, rebase patch against current hash, dry-run, then apply',
        details: { expectedSceneContentHash: expectedHash, actualSceneContentHash: record.sceneContentHash },
      });
    }
  }

  async function persistCreate(input: {
    requestId: string;
    inputHash: string;
    draftId: string;
    name: string;
    description?: string;
    scene: SceneDocumentV1;
    sceneContentHash: string;
    sourceAssetPlan?: SceneDraftRecordV1['sourceAssetPlan'];
    operationType: 'create' | 'compose-asset-plan';
    warnings: SceneDraftDiagnostic[];
  }): Promise<SceneDraftCreateResultV1> {
    const paths = resolveSceneDraftPaths(root, input.draftId);
    return withSceneDraftLock(paths.lockFile, async () => {
      if (await pathExists(paths.draftJson)) {
        const replay = await assertReceiptReplayOrConflict(paths, input.requestId, input.inputHash);
        if (replay) {
          const record = (await readRecord(paths))!;
          const entry = await readHistoryEntry(paths, record.currentHistoryEntryId);
          return {
            dryRun: false,
            replayedFromReceipt: true,
            draft: toSummary(record, entry.scene),
            resultingRevision: record.revision,
            resultingSceneContentHash: record.sceneContentHash,
            historyEntryId: record.currentHistoryEntryId,
            warnings: input.warnings,
          };
        }
        throw new SceneDraftError('SCENE_DRAFT_ALREADY_EXISTS', `Draft ${input.draftId} already exists`, {
          recovery: 'Choose a new draftId',
          details: { draftId: input.draftId },
        });
      }

      const replay = await assertReceiptReplayOrConflict(paths, input.requestId, input.inputHash);
      if (replay) {
        // Should not happen without draft.json, but keep safe
        throw new SceneDraftError('SCENE_DRAFT_ALREADY_EXISTS', `Draft ${input.draftId} already exists`);
      }

      await mkdir(paths.draftDir, { recursive: true });
      await mkdir(paths.revisionsDir, { recursive: true });
      await mkdir(paths.operationsDir, { recursive: true });

      const entryId = computeHistoryEntryId({
        sceneContentHash: input.sceneContentHash,
        operationInputHash: input.inputHash,
        previousEntryId: null,
      });
      const createdAt = nowIso();
      const entry: SceneDraftHistoryEntryV1 = {
        schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
        entryId,
        scene: input.scene,
        sceneContentHash: input.sceneContentHash,
        operation: {
          type: input.operationType,
          requestId: input.requestId,
        },
        sourceAssetPlan: input.sourceAssetPlan,
        createdAt,
      };
      await writeHistoryEntry(paths, entry);

      const record: SceneDraftRecordV1 = {
        schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
        draftId: input.draftId,
        name: input.name,
        description: input.description,
        revision: 1,
        currentHistoryEntryId: entryId,
        historyEntryIds: [entryId],
        historyCursor: 0,
        sceneId: input.scene.id,
        sceneContentHash: input.sceneContentHash,
        sourceAssetPlan: input.sourceAssetPlan,
        createdAt,
        updatedAt: createdAt,
      };

      const receipt: SceneDraftOperationReceiptV1 = {
        schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
        requestId: input.requestId,
        inputHash: input.inputHash,
        operation: input.operationType,
        draftId: input.draftId,
        resultingRevision: 1,
        resultingSceneContentHash: input.sceneContentHash,
        historyEntryId: entryId,
        completedAt: createdAt,
      };
      await writeReceipt(paths, receipt);

      const event: SceneDraftEventV1 = {
        schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
        eventId: `${input.requestId}:${input.operationType}`,
        requestId: input.requestId,
        eventType: input.operationType === 'create' ? 'scene-draft.created' : 'scene-draft.composed',
        draftId: input.draftId,
        nextRevision: 1,
        nextSceneContentHash: input.sceneContentHash,
        occurredAt: createdAt,
      };
      await appendSceneDraftEvent(paths.eventsJsonl, event);
      await atomicWriteJson(paths.draftJson, record);

      return {
        dryRun: false,
        replayedFromReceipt: false,
        draft: toSummary(record, input.scene),
        resultingRevision: 1,
        resultingSceneContentHash: input.sceneContentHash,
        historyEntryId: entryId,
        warnings: input.warnings,
      };
    });
  }

  return {
    getContract(format: 'summary' | 'full' = 'summary') {
      const summary = {
        schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
        draftRootEnv: 'BETTER_CHAT_CUT_SCENE_DRAFT_ROOT',
        storage: {
          layout: '<root>/<draftId>/{draft.json,revisions/,operations/,events.jsonl,draft.lock}',
          snapshotsImmutable: true,
          maxHistoryEntries: MAX_SCENE_DRAFT_HISTORY_ENTRIES,
        },
        concurrency: {
          expectedRevision: true,
          expectedSceneContentHash: true,
          dryRunDefault: true,
        },
        semanticOperations: [
          'scene.set_metadata', 'scene.set_canvas', 'scene.set_timing', 'scene.set_theme', 'scene.set_safe_area',
          'node.add_group', 'node.add_asset', 'node.remove',
          'node.update_layout', 'node.update_transform', 'node.update_timing', 'node.set_enabled', 'node.set_metadata',
          'node.reparent', 'node.set_order',
          'node.replace_asset', 'node.set_props', 'node.set_fit',
          'node.animation_add', 'node.animation_update', 'node.animation_remove',
        ],
        undoRedo: {
          undoDecrementsCursor: true,
          redoIncrementsCursor: true,
          branchAfterUndoTruncatesRedo: true,
          stepsLimit: { min: 1, max: 20 },
        },
        composition: {
          strategies: ['exact', 'reuse', 'variant', 'composition'],
          staleReusableAllowed: true,
          staleUnusableBlocked: true,
        },
        errorCodes: [
          'SCENE_DRAFT_NOT_FOUND', 'SCENE_DRAFT_ALREADY_EXISTS', 'SCENE_DRAFT_REVISION_CONFLICT',
          'SCENE_DRAFT_CONTENT_CONFLICT', 'SCENE_PATCH_FINAL_SCENE_INVALID',
        ],
        examples: {
          create: {
            requestId: 'req-create-1',
            draftId: 'scene-draft.hawking-intro',
            name: 'Hawking intro',
            scene: BASIC_EXPLAINER_SCENE,
            dryRun: true,
          },
          patch: {
            dryRun: true,
            expectedRevision: 1,
            operations: ['node.update_layout', 'node.set_props'],
          },
          preview: { mode: 'still', frame: 0 },
          undo: { steps: 1, dryRun: true },
          redo: { steps: 1, dryRun: true },
        },
      };
      if (format === 'summary') return summary;
      return {
        ...summary,
        notes: [
          'Scene drafts are authoring artifacts, not OpenChatCut projects.',
          'M4A does not write timeline clips or project fields.',
          'All mutations go through SceneDraftService with per-draft locks.',
        ],
      };
    },

    async list(options = {}) {
      const limit = Math.min(100, Math.max(1, options.limit ?? 20));
      const offset = Math.max(0, options.offset ?? 0);
      await mkdir(root, { recursive: true });
      const entries = await readdir(root, { withFileTypes: true });
      const summaries: SceneDraftSummaryV1[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          assertSafeDraftId(entry.name);
          const detail = await this.get(entry.name, { includeHistory: false });
          if (detail) summaries.push(detail.summary);
        } catch {
          // skip invalid dirs
        }
      }
      summaries.sort((a, b) => {
        if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
        return a.draftId.localeCompare(b.draftId);
      });
      return {
        total: summaries.length,
        offset,
        limit,
        items: summaries.slice(offset, offset + limit),
      };
    },

    async get(draftId, options = {}) {
      const includeHistory = options.includeHistory !== false;
      let paths: SceneDraftPaths;
      try {
        paths = resolveSceneDraftPaths(root, draftId);
      } catch {
        return undefined;
      }
      const record = await readRecord(paths);
      if (!record) return undefined;
      const current = await readHistoryEntry(paths, record.currentHistoryEntryId);
      const historyEntries = includeHistory
        ? await Promise.all(record.historyEntryIds.map(async (id) => {
          const entry = await readHistoryEntry(paths, id);
          return {
            entryId: entry.entryId,
            sceneContentHash: entry.sceneContentHash,
            operation: entry.operation,
            createdAt: entry.createdAt,
          };
        }))
        : [];
      return {
        summary: toSummary(record, current.scene),
        scene: current.scene,
        sourceAssetPlan: record.sourceAssetPlan,
        history: {
          cursor: record.historyCursor,
          count: record.historyEntryIds.length,
          entries: historyEntries,
        },
      };
    },

    async create(input) {
      const dryRun = input.dryRun !== false;
      const meta = validateCreateDraftInput(input);
      const validated = await validateScene(input.scene);
      if (!validated.valid || !validated.normalizedScene || !validated.sceneContentHash) {
        throw new SceneDraftError('SCENE_PATCH_FINAL_SCENE_INVALID', 'Scene failed validation', {
          details: { errors: validated.errors },
          recovery: 'Fix scene diagnostics then retry',
        });
      }
      const scene = validated.normalizedScene;
      const sceneContentHash = validated.sceneContentHash;
      const warnings: SceneDraftDiagnostic[] = validated.warnings.map((w) => ({
        severity: w.severity,
        code: w.code,
        message: w.message,
        recovery: w.recovery,
      }));
      if (dryRun) {
        return {
          dryRun: true,
          replayedFromReceipt: false,
          draft: {
            draftId: meta.draftId,
            name: meta.name,
            description: meta.description,
            revision: 1,
            sceneId: scene.id,
            sceneContentHash,
            nodeCount: scene.nodes.length,
            durationInFrames: scene.durationInFrames,
            fps: scene.fps,
            canUndo: false,
            canRedo: false,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          resultingRevision: 1,
          resultingSceneContentHash: sceneContentHash,
          historyEntryId: 'dry-run',
          warnings,
          predictedScene: scene,
        };
      }
      const inputHash = computeInputHash({
        operation: 'create',
        draftId: meta.draftId,
        name: meta.name,
        description: meta.description ?? null,
        sceneContentHash,
      });
      return persistCreate({
        requestId: meta.requestId,
        inputHash,
        draftId: meta.draftId,
        name: meta.name,
        description: meta.description,
        scene,
        sceneContentHash,
        operationType: 'create',
        warnings,
      });
    },

    async composeFromAssetPlan(input) {
      const dryRun = input.dryRun !== false;
      const requestId = assertSafeRequestId(input.requestId);
      const resolver = await getResolver();
      const planValidation = await resolver.validatePlan({ plan: input.plan });
      const composed = composeSceneFromAssetPlan({
        plan: input.plan,
        compositionSpec: input.compositionSpec,
        planValidation,
      });
      const validated = await validateScene(composed.scene);
      if (!validated.valid || !validated.normalizedScene || !validated.sceneContentHash) {
        throw new SceneDraftError('SCENE_PATCH_FINAL_SCENE_INVALID', 'Composed scene failed validation', {
          details: { errors: validated.errors },
          recovery: 'Fix composition placements/timing so the scene validates',
        });
      }
      const scene = validated.normalizedScene;
      const sceneContentHash = validated.sceneContentHash;
      const warnings = [
        ...composed.warnings,
        ...validated.warnings.map((w) => ({
          severity: w.severity as SceneDraftDiagnostic['severity'],
          code: w.code,
          message: w.message,
          recovery: w.recovery,
        })),
      ];
      const draftId = assertSafeDraftId(input.compositionSpec.draft.draftId);
      const name = input.compositionSpec.draft.name;
      const description = input.compositionSpec.draft.description;
      if (dryRun) {
        return {
          dryRun: true,
          replayedFromReceipt: false,
          draft: {
            draftId,
            name,
            description,
            revision: 1,
            sceneId: scene.id,
            sceneContentHash,
            nodeCount: scene.nodes.length,
            durationInFrames: scene.durationInFrames,
            fps: scene.fps,
            canUndo: false,
            canRedo: false,
            sourceAssetPlan: {
              planId: composed.sourceAssetPlan.planId,
              planHash: composed.sourceAssetPlan.planHash,
            },
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          resultingRevision: 1,
          resultingSceneContentHash: sceneContentHash,
          historyEntryId: 'dry-run',
          warnings,
          predictedScene: scene,
        };
      }
      const inputHash = computeInputHash({
        operation: 'compose-asset-plan',
        draftId,
        planHash: input.plan.planHash,
        compositionSpec: input.compositionSpec,
        sceneContentHash,
      });
      return persistCreate({
        requestId,
        inputHash,
        draftId,
        name,
        description,
        scene,
        sceneContentHash,
        sourceAssetPlan: composed.sourceAssetPlan,
        operationType: 'compose-asset-plan',
        warnings,
      });
    },

    async applyPatch(input) {
      const dryRun = input.dryRun !== false;
      const requestId = assertSafeRequestId(input.requestId);
      const draftId = assertSafeDraftId(input.draftId);
      const paths = resolveSceneDraftPaths(root, draftId);

      const run = async (): Promise<SceneDraftPatchResultV1> => {
        const record = await readRecord(paths);
        if (!record) {
          throw new SceneDraftError('SCENE_DRAFT_NOT_FOUND', `Draft ${draftId} not found`, {
            recovery: 'Create the draft first',
          });
        }
        assertGuards(record, input.expectedRevision, input.expectedSceneContentHash);
        const current = await readHistoryEntry(paths, record.currentHistoryEntryId);
        const patched = await applyScenePatch({
          scene: current.scene,
          patch: input.patch,
          previousDependencyCount: current.scene.nodes.filter((n) => n.type === 'asset').length,
        });

        if (dryRun) {
          return {
            dryRun: true,
            draftId,
            currentRevision: record.revision,
            currentSceneContentHash: record.sceneContentHash,
            patchHash: patched.patchHash,
            predictedSceneContentHash: patched.predictedSceneContentHash,
            predictedScene: input.includePredictedScene === true ? patched.predictedScene : undefined,
            validation: patched.validation,
            changeSummary: patched.changeSummary,
            warnings: patched.warnings,
          };
        }

        const inputHash = computeInputHash({
          operation: 'patch',
          draftId,
          expectedRevision: input.expectedRevision,
          expectedSceneContentHash: input.expectedSceneContentHash,
          patchHash: patched.patchHash,
        });
        const replay = await assertReceiptReplayOrConflict(paths, requestId, inputHash);
        if (replay) {
          const latest = (await readRecord(paths))!;
          const entry = await readHistoryEntry(paths, latest.currentHistoryEntryId);
          return {
            dryRun: false,
            replayedFromReceipt: true,
            draft: toSummary(latest, entry.scene),
            previousRevision: replay.previousRevision ?? latest.revision,
            resultingRevision: latest.revision,
            previousSceneContentHash: replay.previousSceneContentHash ?? latest.sceneContentHash,
            resultingSceneContentHash: latest.sceneContentHash,
            historyEntryId: latest.currentHistoryEntryId,
            patchHash: patched.patchHash,
            changeSummary: patched.changeSummary,
            warnings: patched.warnings,
          };
        }

        const activeIds = record.historyEntryIds.slice(0, record.historyCursor + 1);
        if (activeIds.length >= MAX_SCENE_DRAFT_HISTORY_ENTRIES) {
          throw new SceneDraftError(
            'SCENE_DRAFT_HISTORY_LIMIT_REACHED',
            `Active history would exceed ${MAX_SCENE_DRAFT_HISTORY_ENTRIES} entries`,
            { recovery: 'Start a new draft or wait for future compaction support' },
          );
        }

        const entryId = computeHistoryEntryId({
          sceneContentHash: patched.predictedSceneContentHash,
          operationInputHash: inputHash,
          previousEntryId: record.currentHistoryEntryId,
        });
        const createdAt = nowIso();
        const entry: SceneDraftHistoryEntryV1 = {
          schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
          entryId,
          scene: patched.predictedScene,
          sceneContentHash: patched.predictedSceneContentHash,
          operation: {
            type: 'patch',
            requestId,
            patchHash: patched.patchHash,
          },
          sourceAssetPlan: record.sourceAssetPlan,
          createdAt,
        };
        await writeHistoryEntry(paths, entry);

        const nextRecord: SceneDraftRecordV1 = {
          ...record,
          revision: record.revision + 1,
          currentHistoryEntryId: entryId,
          historyEntryIds: [...activeIds, entryId],
          historyCursor: activeIds.length,
          sceneContentHash: patched.predictedSceneContentHash,
          updatedAt: createdAt,
        };
        const receipt: SceneDraftOperationReceiptV1 = {
          schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
          requestId,
          inputHash,
          operation: 'patch',
          draftId,
          previousRevision: record.revision,
          resultingRevision: nextRecord.revision,
          previousSceneContentHash: record.sceneContentHash,
          resultingSceneContentHash: nextRecord.sceneContentHash,
          historyEntryId: entryId,
          completedAt: createdAt,
        };
        await writeReceipt(paths, receipt);
        await appendSceneDraftEvent(paths.eventsJsonl, {
          schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
          eventId: `${requestId}:patch`,
          requestId,
          eventType: 'scene-draft.patched',
          draftId,
          previousRevision: record.revision,
          nextRevision: nextRecord.revision,
          previousSceneContentHash: record.sceneContentHash,
          nextSceneContentHash: nextRecord.sceneContentHash,
          patchHash: patched.patchHash,
          occurredAt: createdAt,
        });
        await atomicWriteJson(paths.draftJson, nextRecord);
        return {
          dryRun: false,
          replayedFromReceipt: false,
          draft: toSummary(nextRecord, patched.predictedScene),
          previousRevision: record.revision,
          resultingRevision: nextRecord.revision,
          previousSceneContentHash: record.sceneContentHash,
          resultingSceneContentHash: nextRecord.sceneContentHash,
          historyEntryId: entryId,
          patchHash: patched.patchHash,
          changeSummary: patched.changeSummary,
          warnings: patched.warnings,
        };
      };

      if (dryRun) return run();
      return withSceneDraftLock(paths.lockFile, run);
    },

    async undo(input) {
      return historyMove(input, 'undo');
    },

    async redo(input) {
      return historyMove(input, 'redo');
    },

    async validate(draftId, options = {}) {
      const detail = await this.get(draftId, { includeHistory: true });
      if (!detail) {
        throw new SceneDraftError('SCENE_DRAFT_NOT_FOUND', `Draft ${draftId} not found`);
      }
      const paths = resolveSceneDraftPaths(root, draftId);
      const entryId = options.historyEntryId ?? detail.history.entries[detail.history.cursor]?.entryId;
      if (!entryId) {
        throw new SceneDraftError('SCENE_DRAFT_HISTORY_ENTRY_NOT_FOUND', 'No history entry available');
      }
      const entry = await readHistoryEntry(paths, entryId);
      const validator = createSceneValidator();
      const validated = await validator.validate(entry.scene, {
        includeDependencies: true,
        analyzeLayout: options.analyzeLayout === true,
        analysisFrames: options.analysisFrames,
      });
      return {
        draftId,
        revision: detail.summary.revision,
        historyEntryId: entryId,
        sceneContentHash: entry.sceneContentHash,
        valid: validated.valid,
        dependencyFingerprint: validated.dependencyFingerprint,
        errors: validated.errors.map((e) => ({
          severity: e.severity,
          code: e.code,
          message: e.message,
          nodeId: e.nodeId,
          path: e.path,
          recovery: e.recovery,
        })),
        warnings: validated.warnings.map((e) => ({
          severity: e.severity,
          code: e.code,
          message: e.message,
          nodeId: e.nodeId,
          path: e.path,
          recovery: e.recovery,
        })),
      };
    },

    async renderPreview(input) {
      const detail = await this.get(input.draftId, { includeHistory: true });
      if (!detail) {
        throw new SceneDraftError('SCENE_DRAFT_NOT_FOUND', `Draft ${input.draftId} not found`);
      }
      const paths = resolveSceneDraftPaths(root, input.draftId);
      const entryId = input.historyEntryId
        ?? detail.history.entries[detail.history.cursor]?.entryId
        ?? (await readRecord(paths))!.currentHistoryEntryId;
      const entry = await readHistoryEntry(paths, entryId);
      const preview = createScenePreviewService();
      if (input.mode === 'still') {
        return preview.renderStill({
          scene: entry.scene,
          frame: input.frame ?? 0,
          outputWidth: input.outputWidth,
          outputHeight: input.outputHeight,
        });
      }
      return preview.renderContactSheet({
        scene: entry.scene,
        frames: input.frames,
        columns: input.columns,
        cellLabelMode: input.cellLabelMode,
        cellWidth: input.cellWidth,
      });
    },

    async createBindingPayload(input) {
      const draftId = assertSafeDraftId(input.draftId);
      const detail = await this.get(draftId, { includeHistory: true });
      if (!detail) {
        throw new SceneDraftError('SCENE_DRAFT_NOT_FOUND', `Draft ${draftId} not found`);
      }
      const paths = resolveSceneDraftPaths(root, draftId);
      const historyEntryId = input.historyEntryId
        ?? detail.history.entries[detail.history.cursor]?.entryId;
      if (!historyEntryId) {
        throw new SceneDraftError('SCENE_DRAFT_HISTORY_ENTRY_NOT_FOUND', 'No history entry available');
      }
      if (!detail.history.entries.some((entry) => entry.entryId === historyEntryId)) {
        throw new SceneDraftError('SCENE_DRAFT_HISTORY_ENTRY_NOT_FOUND', `History entry ${historyEntryId} not found`);
      }
      const entry = await readHistoryEntry(paths, historyEntryId);
      return {
        draftId,
        draftRevision: detail.summary.revision,
        historyEntryId,
        sceneContentHash: entry.sceneContentHash,
        scene: entry.scene,
        sourceAssetPlan: detail.sourceAssetPlan,
      };
    },
  };

  async function historyMove(
    input: SceneDraftHistoryMutationInput,
    direction: 'undo' | 'redo',
  ): Promise<SceneDraftMutationResultV1 | SceneDraftHistoryDryRunResultV1> {
    const dryRun = input.dryRun !== false;
    const requestId = assertSafeRequestId(input.requestId);
    const draftId = assertSafeDraftId(input.draftId);
    const steps = input.steps ?? 1;
    if (!Number.isInteger(steps) || steps < 1 || steps > 20) {
      throw new SceneDraftError('SCENE_DRAFT_INVALID_ID', 'steps must be an integer from 1 to 20', {
        recovery: 'Pass steps between 1 and 20',
      });
    }
    const paths = resolveSceneDraftPaths(root, draftId);

    const run = async () => {
      const record = await readRecord(paths);
      if (!record) {
        throw new SceneDraftError('SCENE_DRAFT_NOT_FOUND', `Draft ${draftId} not found`);
      }
      assertGuards(record, input.expectedRevision, input.expectedSceneContentHash);
      const targetCursor = direction === 'undo'
        ? record.historyCursor - steps
        : record.historyCursor + steps;
      if (targetCursor < 0) {
        throw new SceneDraftError('SCENE_DRAFT_UNDO_UNAVAILABLE', 'Nothing to undo', {
          recovery: 'Check canUndo via scene_draft_get',
        });
      }
      if (targetCursor >= record.historyEntryIds.length) {
        throw new SceneDraftError('SCENE_DRAFT_REDO_UNAVAILABLE', 'Nothing to redo', {
          recovery: 'Check canRedo via scene_draft_get',
        });
      }
      const targetEntryId = record.historyEntryIds[targetCursor]!;
      const targetEntry = await readHistoryEntry(paths, targetEntryId);
      if (dryRun) {
        return {
          dryRun: true as const,
          draftId,
          currentRevision: record.revision,
          currentSceneContentHash: record.sceneContentHash,
          predictedRevision: record.revision + 1,
          predictedSceneContentHash: targetEntry.sceneContentHash,
          targetHistoryEntryId: targetEntryId,
          targetSceneSummary: {
            sceneId: targetEntry.scene.id,
            nodeCount: targetEntry.scene.nodes.length,
            durationInFrames: targetEntry.scene.durationInFrames,
            fps: targetEntry.scene.fps,
          },
          warnings: [] as SceneDraftDiagnostic[],
        };
      }

      const inputHash = computeInputHash({
        operation: direction,
        draftId,
        expectedRevision: input.expectedRevision,
        expectedSceneContentHash: input.expectedSceneContentHash,
        steps,
        targetEntryId,
      });
      const replay = await assertReceiptReplayOrConflict(paths, requestId, inputHash);
      if (replay) {
        const latest = (await readRecord(paths))!;
        const entry = await readHistoryEntry(paths, latest.currentHistoryEntryId);
        return {
          dryRun: false as const,
          replayedFromReceipt: true,
          draft: toSummary(latest, entry.scene),
          previousRevision: replay.previousRevision ?? latest.revision,
          resultingRevision: latest.revision,
          previousSceneContentHash: replay.previousSceneContentHash ?? latest.sceneContentHash,
          resultingSceneContentHash: latest.sceneContentHash,
          historyEntryId: latest.currentHistoryEntryId,
          warnings: [],
        };
      }

      const updatedAt = nowIso();
      const nextRecord: SceneDraftRecordV1 = {
        ...record,
        revision: record.revision + 1,
        historyCursor: targetCursor,
        currentHistoryEntryId: targetEntryId,
        sceneContentHash: targetEntry.sceneContentHash,
        updatedAt,
      };
      await writeReceipt(paths, {
        schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
        requestId,
        inputHash,
        operation: direction,
        draftId,
        previousRevision: record.revision,
        resultingRevision: nextRecord.revision,
        previousSceneContentHash: record.sceneContentHash,
        resultingSceneContentHash: nextRecord.sceneContentHash,
        historyEntryId: targetEntryId,
        completedAt: updatedAt,
      });
      await appendSceneDraftEvent(paths.eventsJsonl, {
        schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
        eventId: `${requestId}:${direction}`,
        requestId,
        eventType: direction === 'undo' ? 'scene-draft.undone' : 'scene-draft.redone',
        draftId,
        previousRevision: record.revision,
        nextRevision: nextRecord.revision,
        previousSceneContentHash: record.sceneContentHash,
        nextSceneContentHash: nextRecord.sceneContentHash,
        occurredAt: updatedAt,
      });
      await atomicWriteJson(paths.draftJson, nextRecord);
      return {
        dryRun: false as const,
        replayedFromReceipt: false,
        draft: toSummary(nextRecord, targetEntry.scene),
        previousRevision: record.revision,
        resultingRevision: nextRecord.revision,
        previousSceneContentHash: record.sceneContentHash,
        resultingSceneContentHash: nextRecord.sceneContentHash,
        historyEntryId: targetEntryId,
        warnings: [],
      };
    };

    if (dryRun) return run();
    return withSceneDraftLock(paths.lockFile, run);
  }
}

export function resolveSceneDraftServiceRoot(): string {
  return resolveSceneDraftRoot();
}
