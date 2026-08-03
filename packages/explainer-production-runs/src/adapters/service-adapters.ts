import type { AssetRequirementSetV1 } from '../../../asset-resolver/src/contracts/asset-requirement-set.ts';
import type { AssetPlanV1 } from '../../../asset-resolver/src/contracts/asset-plan.ts';
import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import type { NarrationPlanV1 } from '../../../narration-plans/src/contracts/narration-plan.ts';
import type { NarrationSpeakerV1 } from '../../../narration-plans/src/contracts/narration-speaker.ts';
import type { SceneClipBindingV1 } from '../../../project-scene-bindings/src/contracts/scene-clip-binding.ts';
import type { ExplainerProductionRequestV1, StoryboardV1 } from '../../../explainer-production-contracts/src/index.ts';
import type {
  MotionAssetAuthoringTaskSetV1,
  SceneDraftSetArtifactV1,
  SceneReviewReportV1,
} from '../contracts/production-run-summary.ts';

export type ProjectTargetInfo = {
  projectId: string;
  width: number;
  height: number;
  fps: number;
  targeted: boolean;
};

export type EditSessionStatus = {
  editSessionId: string;
  status: 'open' | 'pending-review' | 'applied' | 'rejected' | 'discarded' | 'stale' | 'failed';
};

export type ExternalOperationStatus = {
  id: string;
  type: 'tts' | 'production-render' | 'edit-session';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string;
  details?: Record<string, unknown>;
};

export type ProductionServiceAdapters = {
  projectTarget: {
    getTargetedProject(expectedProjectId?: string): ProjectTargetInfo | null;
  };
  assetResolver: {
    resolve(requirementSet: AssetRequirementSetV1, policy: { allowStaging: boolean }): Promise<{
      plan: AssetPlanV1;
      hasCreationBriefs: boolean;
      hasDuplicateReview: boolean;
      unresolvedRequired: string[];
    }>;
  };
  motionAuthoring: {
    inspectTasks(tasks: MotionAssetAuthoringTaskSetV1): Promise<MotionAssetAuthoringTaskSetV1>;
  };
  sceneDraft: {
    composeScenes(input: {
      storyboard: StoryboardV1;
      assetPlan: AssetPlanV1;
      productionRequest: ExplainerProductionRequestV1;
    }): Promise<SceneDraftSetArtifactV1>;
    buildReviewReport(set: SceneDraftSetArtifactV1): Promise<SceneReviewReportV1>;
    buildBindings(set: SceneDraftSetArtifactV1): Promise<SceneClipBindingV1[]>;
  };
  videoPlan: {
    validate(plan: VideoPlanV1): { valid: boolean; errors: string[] };
  };
  editSession: {
    getStatus(editSessionId: string): Promise<EditSessionStatus>;
    assembleVideoPlan(input: {
      editSessionId: string;
      videoPlan: VideoPlanV1;
      dryRun: boolean;
    }): Promise<{ report: unknown; applied: boolean }>;
    applyNarration(input: {
      editSessionId: string;
      narrationPlan: NarrationPlanV1;
      timing: unknown;
      dryRun: boolean;
    }): Promise<{ report: unknown; applied: boolean }>;
  };
  narration: {
    prepareTts(input: {
      narrationPlan: NarrationPlanV1;
      dryRun: boolean;
      existingOperationId?: string;
    }): Promise<{ operationId: string; status: string; timing?: unknown }>;
    getTtsStatus(operationId: string): Promise<ExternalOperationStatus>;
    resolveTiming(operationId: string): Promise<unknown>;
  };
  productionRender: {
    prepare(input: {
      productionRequest: ExplainerProductionRequestV1;
      projectId: string;
      dryRun: boolean;
    }): Promise<{ plan: unknown; planHash: string }>;
    submit(input: {
      requestId: string;
      plan: unknown;
      projectId: string;
      dryRun: boolean;
      existingOperationId?: string;
    }): Promise<{ operationId: string; bundleId: string; status: string }>;
    getStatus(operationId: string): Promise<ExternalOperationStatus & {
      bundleId?: string;
      manifestHash?: string;
    }>;
    validateBundle(bundleId: string): Promise<{
      valid: boolean;
      manifestHash?: string;
      qaStatus?: 'passed' | 'passed-with-warnings' | 'failed';
      artifacts?: { role: string; fileName: string; sha256: string; downloadUrl: string }[];
      errors: string[];
    }>;
    cancel?(operationId: string): Promise<{ attempted: boolean; status?: string }>;
  };
};

export type StageInputExtras = {
  editSessionId?: string;
  speakers?: NarrationSpeakerV1[];
  voiceoverSourceId?: string;
  alignmentOverrides?: unknown;
  renderOptions?: Record<string, unknown>;
  [key: string]: unknown;
};

export function createFakeAdapters(overrides?: Partial<ProductionServiceAdapters>): ProductionServiceAdapters {
  const base: ProductionServiceAdapters = {
    projectTarget: {
      getTargetedProject(expected) {
        return {
          projectId: expected ?? 'project-test',
          width: 1920,
          height: 1080,
          fps: 30,
          targeted: true,
        };
      },
    },
    assetResolver: {
      async resolve(requirementSet, policy) {
        const decisions = requirementSet.requirements.map((req, index) => ({
          requirementId: req.id,
          status: index === requirementSet.requirements.length - 1 && !policy.allowStaging
            ? 'create' as const
            : 'resolved' as const,
          selection: index === requirementSet.requirements.length - 1
            ? undefined
            : {
              assetId: `asset.${req.id}`,
              version: '1.0.0',
              strategy: 'exact' as const,
            },
          creationBrief: index === requirementSet.requirements.length - 1
            ? { requirementId: req.id, name: req.name, description: req.description }
            : undefined,
        }));
        const unresolvedRequired = decisions
          .filter((d) => d.status === 'create')
          .map((d) => d.requirementId);
        const plan = {
          schemaVersion: '1.0.0' as const,
          id: `plan.${requirementSet.id}`,
          requirementSetId: requirementSet.id,
          planHash: 'fakeplanhash',
          decisions: decisions.map((d) => ({
            requirementId: d.requirementId,
            outcome: d.status === 'create' ? 'creation-brief' as const : 'selected' as const,
            selection: d.selection,
            creationBrief: d.creationBrief,
          })),
        } as unknown as AssetPlanV1;
        return {
          plan,
          hasCreationBriefs: unresolvedRequired.length > 0,
          hasDuplicateReview: false,
          unresolvedRequired,
        };
      },
    },
    motionAuthoring: {
      async inspectTasks(tasks) {
        return {
          ...tasks,
          tasks: tasks.tasks.map((t) => ({
            ...t,
            status: 'published' as const,
            assetId: t.assetId ?? `asset.authored.${t.requirementId}`,
            assetVersion: t.assetVersion ?? '1.0.0',
          })),
        };
      },
    },
    sceneDraft: {
      async composeScenes({ storyboard }) {
        return {
          scenes: storyboard.scenes.map((scene, i) => ({
            storyboardSceneId: scene.id,
            draftId: `draft.${scene.id}`,
            draftRevision: 1,
            sceneContentHash: `scenehash${i.toString().padStart(2, '0')}`.padEnd(64, '0'),
            bindingPayloadHash: `bindhash${i.toString().padStart(2, '0')}`.padEnd(64, '0'),
            preview: { stillAvailable: true, contactSheetAvailable: true },
          })),
        };
      },
      async buildReviewReport(set) {
        return {
          scenes: set.scenes.map((s) => ({
            storyboardSceneId: s.storyboardSceneId,
            draftId: s.draftId,
            revision: s.draftRevision,
            sceneContentHash: s.sceneContentHash,
            validation: { valid: true, errors: [], warnings: [] },
            previewReferences: [`preview:${s.draftId}`],
            reviewStatus: 'pending' as const,
          })),
        };
      },
      async buildBindings(set) {
        return set.scenes.map((s) => ({
          schemaVersion: '1.0.0',
          bindingMode: 'embedded-snapshot',
          sourceDraft: {
            draftId: s.draftId,
            draftRevision: s.draftRevision,
            historyEntryId: 'hist.1',
            sceneContentHash: s.sceneContentHash,
          },
          scene: {
            schemaVersion: '1.0.0',
            id: s.storyboardSceneId,
            name: s.storyboardSceneId,
            canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
            fps: 30,
            durationInFrames: 90,
            theme: { id: 'theme.default', version: '1.0.0' },
            rootNodeId: 'root',
            nodes: {},
          },
          sceneContentHash: s.sceneContentHash,
          dependencyFingerprint: 'dep',
          catalogRevision: '1',
          motionRuntimeRevision: '1',
          sceneRuntimeRevision: '1',
          dependencies: {
            assets: [],
            animations: [],
            theme: { id: 'theme.default', version: '1.0.0' },
          },
          bindingPayloadHash: s.bindingPayloadHash,
        })) as unknown as SceneClipBindingV1[];
      },
    },
    videoPlan: {
      validate() {
        return { valid: true, errors: [] };
      },
    },
    editSession: {
      async getStatus(editSessionId) {
        return { editSessionId, status: 'applied' };
      },
      async assembleVideoPlan({ dryRun }) {
        return {
          report: { ok: true, dryRun },
          applied: !dryRun,
        };
      },
      async applyNarration({ dryRun }) {
        return {
          report: { ok: true, dryRun },
          applied: !dryRun,
        };
      },
    },
    narration: {
      async prepareTts({ existingOperationId, dryRun }) {
        const id = existingOperationId ?? 'tts.op.1';
        if (dryRun) return { operationId: id, status: 'planned' };
        return { operationId: id, status: 'queued' };
      },
      async getTtsStatus(operationId) {
        return { id: operationId, type: 'tts', status: 'completed' };
      },
      async resolveTiming(operationId) {
        return { schemaVersion: '1.0.0', operationId, segments: [] };
      },
    },
    productionRender: {
      async prepare({ dryRun }) {
        return {
          plan: { schemaVersion: '1.0.0', dryRun },
          planHash: 'renderplanhash0000111122223333444455556666777788889999aaaa',
        };
      },
      async submit({ existingOperationId, dryRun }) {
        const id = existingOperationId ?? 'render.op.1';
        if (dryRun) return { operationId: id, bundleId: 'delivery.test.aaaa0000', status: 'planned' };
        return { operationId: id, bundleId: 'delivery.test.aaaa0000', status: 'queued' };
      },
      async getStatus(operationId) {
        return {
          id: operationId,
          type: 'production-render',
          status: 'completed',
          bundleId: 'delivery.test.aaaa0000',
          manifestHash: 'manifesthash0000111122223333444455556666777788889999aa',
        };
      },
      async validateBundle(bundleId) {
        return {
          valid: true,
          manifestHash: 'manifesthash0000111122223333444455556666777788889999aa',
          qaStatus: 'passed',
          artifacts: [
            { role: 'video', fileName: 'delivery.mp4', sha256: 'a'.repeat(64), downloadUrl: `/api/better-chat-cut/deliveries/${bundleId}/delivery.mp4` },
            { role: 'srt', fileName: 'delivery.srt', sha256: 'b'.repeat(64), downloadUrl: `/api/better-chat-cut/deliveries/${bundleId}/delivery.srt` },
            { role: 'vtt', fileName: 'delivery.vtt', sha256: 'c'.repeat(64), downloadUrl: `/api/better-chat-cut/deliveries/${bundleId}/delivery.vtt` },
          ],
          errors: [],
        };
      },
      async cancel(_operationId: string) {
        return { attempted: true, status: 'cancelled' };
      },
    },
  };

  return {
    ...base,
    ...overrides,
    projectTarget: { ...base.projectTarget, ...overrides?.projectTarget },
    assetResolver: { ...base.assetResolver, ...overrides?.assetResolver },
    motionAuthoring: { ...base.motionAuthoring, ...overrides?.motionAuthoring },
    sceneDraft: { ...base.sceneDraft, ...overrides?.sceneDraft },
    videoPlan: { ...base.videoPlan, ...overrides?.videoPlan },
    editSession: { ...base.editSession, ...overrides?.editSession },
    narration: { ...base.narration, ...overrides?.narration },
    productionRender: { ...base.productionRender, ...overrides?.productionRender },
  };
}
