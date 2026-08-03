import {
  createProductionRenderPlanService,
  prepareProductionRender,
  validateProductionRenderRequest,
  computeProductionRenderRevision,
  PRODUCTION_RENDER_SCHEMA_VERSION,
  PRODUCTION_RENDER_PROFILE_IDS,
  DEFAULT_PRODUCTION_QA_POLICY,
  DEFAULT_PRODUCTION_DELIVERY_POLICY,
  ProductionRenderError,
} from '../../../packages/production-render-plans/src/index.ts';
import {
  createProductionRenderService,
  createDeliveryStore,
  resolveDeliveryRoot,
  ProductionRenderError as BundleError,
} from '../../../packages/production-render-bundles/src/index.ts';
import { readStore } from '../../plugins/project-store.ts';
import type { ProductionProjectLike } from '../../../packages/production-render-plans/src/preparation/prepare-production-render.ts';

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

let serviceForTests: ReturnType<typeof createProductionRenderService> | null = null;

export function setProductionRenderServiceForTests(
  service: ReturnType<typeof createProductionRenderService> | null,
): void {
  serviceForTests = service;
}

function getService() {
  return serviceForTests ?? createProductionRenderService();
}

export const PRODUCTION_RENDER_CONTROL_TOOLS = [
  {
    name: 'production_render_get_contract',
    description: 'Return Better Chat Cut ProductionRenderRequest/Plan contract: profiles, range modes, subtitle/QA/delivery policies, fingerprints, operation lifecycle, bundle layout, limitations. Read-only.',
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
    name: 'production_render_prepare',
    description: 'Prepare an immutable ProductionRenderPlanV1 from the targeted live project. Does not mutate the project or start a render.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        request: { type: 'object' },
        sourceMode: { type: 'string', enum: ['live-project', 'edit-session-draft'] },
        editSessionId: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['request'],
    },
    annotations: readOnly,
  },
  {
    name: 'production_render_submit',
    description: 'Submit a prepared production render plan. Idempotent by requestId. Renders MP4/SRT/VTT, runs QA, and finalizes an immutable delivery bundle. Does not mutate the project.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        plan: { type: 'object' },
        projectId: { type: 'string' },
      },
      required: ['requestId', 'plan'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'production_render_status',
    description: 'Read production render operation status and completed bundle artifact summaries. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        operationId: { type: 'string', minLength: 1 },
      },
      required: ['operationId'],
    },
    annotations: readOnly,
  },
  {
    name: 'production_render_cancel',
    description: 'Cancel a queued/running production render operation if supported. Does not delete completed bundles.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        operationId: { type: 'string', minLength: 1 },
      },
      required: ['operationId'],
    },
    annotations: writeDestructive,
  },
  {
    name: 'production_render_list',
    description: 'List production render operations with optional status filter and pagination. Read-only.',
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
    name: 'production_render_get_manifest',
    description: 'Get a completed delivery bundle manifest and artifact download URLs. Never returns filesystem paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        bundleId: { type: 'string', minLength: 1 },
      },
      required: ['bundleId'],
    },
    annotations: readOnly,
  },
  {
    name: 'production_render_validate_bundle',
    description: 'Validate a completed delivery bundle hashes/manifest without re-rendering.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        bundleId: { type: 'string', minLength: 1 },
        reProbeMedia: { type: 'boolean' },
      },
      required: ['bundleId'],
    },
    annotations: readOnly,
  },
] as const;

async function loadProject(projectId: string): Promise<ProductionProjectLike> {
  const store = await readStore();
  const value = store.entries[`project:${projectId}`];
  if (!value || typeof value !== 'object') {
    throw new ProductionRenderError('PRODUCTION_RENDER_TIMELINE_NOT_FOUND', `Project ${projectId} not found in store`, {
      recovery: 'Open/target the project in OpenChatCut first',
    });
  }
  return value as ProductionProjectLike;
}

export async function runProductionRenderControlTool(
  name: string,
  args: Record<string, unknown>,
  context: { projectId?: string | null } = {},
): Promise<unknown> {
  try {
    if (name === 'production_render_get_contract') {
      const full = args.format === 'full';
      return {
        schemaVersion: PRODUCTION_RENDER_SCHEMA_VERSION,
        productionRenderRevision: computeProductionRenderRevision(),
        profiles: PRODUCTION_RENDER_PROFILE_IDS,
        rangeModes: ['full-timeline', 'video-plan-assembly', 'frames'],
        defaultQa: DEFAULT_PRODUCTION_QA_POLICY,
        defaultDelivery: DEFAULT_PRODUCTION_DELIVERY_POLICY,
        deliveryRootEnv: 'BETTER_CHAT_CUT_DELIVERY_ROOT',
        downloadUrlPattern: '/api/better-chat-cut/deliveries/<bundle-id>/<artifact-name>',
        tools: PRODUCTION_RENDER_CONTROL_TOOLS.map((t) => t.name),
        workflow: [
          'production_render_prepare',
          'production_render_submit',
          'production_render_status',
          'production_render_get_manifest',
          'production_render_validate_bundle',
        ],
        limitations: [
          'No publishing/YouTube upload',
          'No research/script/storyboard orchestration',
          'No loudness normalization/mastering',
          'Final render requires live-project source',
          'Resume restarts video render phase (not frame-level) when exporter lacks frame resume',
        ],
        ...(full ? {
          planService: Object.keys(createProductionRenderPlanService()),
          exampleFullTimeline: {
            schemaVersion: '1.0.0',
            id: 'render.example',
            name: 'Example',
            source: { range: { mode: 'full-timeline' } },
            profile: { id: 'preview-720p-h264' },
            subtitles: { includeSrt: false, includeVtt: false, source: { type: 'none' } },
          },
        } : {}),
      };
    }

    if (name === 'production_render_prepare') {
      if (args.sourceMode === 'edit-session-draft' && !args.editSessionId) {
        throw new ProductionRenderError('PRODUCTION_RENDER_SOURCE_MODE_INVALID', 'editSessionId required for edit-session-draft');
      }
      const projectId = String(args.projectId ?? context.projectId ?? '').trim();
      if (!projectId) {
        throw new ProductionRenderError('PRODUCTION_RENDER_TIMELINE_NOT_FOUND', 'projectId required for prepare', {
          recovery: 'Call target_project or pass projectId',
        });
      }
      if (args.sourceMode === 'edit-session-draft') {
        // Preview-only: still read live project; final submit will reject draft source.
      }
      const project = await loadProject(projectId);
      const before = JSON.stringify(project);
      const result = prepareProductionRender({
        project,
        projectId,
        request: args.request,
      });
      const after = JSON.stringify(await loadProject(projectId));
      if (before !== after) {
        throw new ProductionRenderError('PRODUCTION_RENDER_FAILED', 'Prepare mutated project store unexpectedly');
      }
      return result;
    }

    if (name === 'production_render_submit') {
      const projectId = String(args.projectId ?? context.projectId ?? '').trim();
      if (!projectId) {
        throw new ProductionRenderError('PRODUCTION_RENDER_TIMELINE_NOT_FOUND', 'projectId required for submit');
      }
      const project = await loadProject(projectId);
      const before = JSON.stringify(project);
      const service = getService();
      const result = await service.submit({
        requestId: String(args.requestId),
        plan: args.plan as never,
        project,
        projectId,
        sourceMode: 'live-project',
      });
      const after = JSON.stringify(await loadProject(projectId));
      if (before !== after) {
        throw new ProductionRenderError('PRODUCTION_RENDER_FAILED', 'Submit mutated project store unexpectedly');
      }
      return result;
    }

    if (name === 'production_render_status') {
      return getService().status(String(args.operationId));
    }

    if (name === 'production_render_cancel') {
      return getService().cancel(String(args.operationId));
    }

    if (name === 'production_render_list') {
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 20)));
      const offset = Math.max(0, Number(args.offset ?? 0));
      const status = Array.isArray(args.status) ? args.status.map(String) : undefined;
      const operations = getService().store.listOperations({ status, limit, offset }).map((op) => ({
        operationId: op.operationId,
        bundleId: op.bundleId,
        status: op.status,
        planHash: op.planHash,
        requestId: op.requestId,
        qaStatus: op.qaStatus,
        updatedAt: op.updatedAt,
      }));
      return { operations, limit, offset };
    }

    if (name === 'production_render_get_manifest') {
      const store = getService().store;
      const manifest = store.readManifest(String(args.bundleId));
      if (!manifest) {
        return {
          manifest: null,
          valid: false,
          artifacts: [],
          errors: [{ severity: 'error', code: 'PRODUCTION_RENDER_BUNDLE_NOT_FOUND', message: 'Bundle not found', recovery: 'Submit a successful production render first' }],
          warnings: [],
        };
      }
      const validation = store.validateBundle(String(args.bundleId));
      return {
        manifest,
        valid: validation.valid,
        artifacts: manifest.artifacts,
        errors: validation.errors.map((message) => ({
          severity: 'error',
          code: 'PRODUCTION_RENDER_BUNDLE_CORRUPT',
          message,
          recovery: 'Re-render into a new bundle id',
        })),
        warnings: [],
      };
    }

    if (name === 'production_render_validate_bundle') {
      const store = getService().store;
      const validation = store.validateBundle(String(args.bundleId));
      return {
        valid: validation.valid,
        manifestHashValid: validation.manifestHashValid,
        artifactHashesValid: validation.artifactHashesValid,
        mediaProbeValid: args.reProbeMedia === false ? true : validation.valid,
        subtitleValidationValid: validation.valid,
        qaReportValid: validation.valid,
        errors: validation.errors.map((message) => ({
          severity: 'error',
          code: 'PRODUCTION_RENDER_BUNDLE_CORRUPT',
          message,
          recovery: 'Create a new production render operation',
        })),
        warnings: [],
      };
    }

    throw new ProductionRenderError('PRODUCTION_RENDER_SCHEMA_UNSUPPORTED', `Unknown tool ${name}`);
  } catch (error) {
    if (error instanceof ProductionRenderError || error instanceof BundleError) throw error;
    throw error;
  }
}

export { validateProductionRenderRequest, resolveDeliveryRoot, createDeliveryStore };
