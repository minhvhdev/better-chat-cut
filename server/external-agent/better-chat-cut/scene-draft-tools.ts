import {
  SCENE_LIMITS,
  SCENE_SCHEMA_VERSION,
} from '../../../packages/scene-graph/src/index.ts';
import {
  ASSET_PLAN_SCHEMA_VERSION,
} from '../../../packages/asset-resolver/src/index.ts';
import {
  MAX_SCENE_DRAFT_HISTORY_ENTRIES,
  SCENE_DRAFT_SCHEMA_VERSION,
  SceneDraftError,
  createSceneDraftService,
  resolveSceneDraftRoot,
  type SceneDraftStore,
} from '../../../packages/scene-drafts/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeSafe = {
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

const sceneObjectSchema = {
  type: 'object',
  description: 'SceneDocumentV1 JSON',
  additionalProperties: true,
  properties: {
    schemaVersion: { type: 'string', enum: [SCENE_SCHEMA_VERSION] },
    id: { type: 'string' },
    name: { type: 'string' },
    canvas: { type: 'object' },
    fps: { type: 'number' },
    durationInFrames: { type: 'integer' },
    theme: { type: 'object' },
    nodes: { type: 'array' },
  },
} as const;

const patchSchema = {
  type: 'object',
  description: 'ScenePatchV1 semantic operations only; no JSON Patch / JSON Pointer',
  additionalProperties: false,
  required: ['schemaVersion', 'id', 'operations'],
  properties: {
    schemaVersion: { type: 'string', enum: ['1.0.0'] },
    id: { type: 'string' },
    description: { type: 'string' },
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: { type: 'object', additionalProperties: true },
    },
  },
} as const;

const writeGuardProps = {
  requestId: { type: 'string', minLength: 1, maxLength: 128 },
  draftId: { type: 'string', minLength: 1, maxLength: 128 },
  expectedRevision: { type: 'integer', minimum: 1 },
  expectedSceneContentHash: { type: 'string', minLength: 16 },
  dryRun: { type: 'boolean', description: 'Defaults to true' },
} as const;

export const SCENE_DRAFT_TOOLS = [
  {
    name: 'scene_draft_get_contract',
    description: 'Return Better Chat Cut scene draft contract: persistence, concurrency, semantic ops, composition, undo/redo, limits. Read-only.',
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
    name: 'scene_draft_list',
    description: 'List persistent scene draft summaries. Does not require an open project.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        offset: { type: 'integer', minimum: 0 },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'scene_draft_get',
    description: 'Get a scene draft detail including current scene and history summaries. Returns draft:null when missing.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['draftId'],
      properties: {
        draftId: { type: 'string' },
        includeHistory: { type: 'boolean' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'scene_draft_create',
    description: 'Create a persistent scene draft from an inline SceneDocumentV1. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'draftId', 'name', 'scene'],
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        draftId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        scene: sceneObjectSchema,
        dryRun: { type: 'boolean' },
      },
    },
    annotations: writeSafe,
  },
  {
    name: 'scene_draft_compose_asset_plan',
    description: 'Compose a scene draft from AssetPlanV1 + composition spec. Does not re-resolve or create assets. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'plan', 'compositionSpec'],
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        plan: {
          type: 'object',
          additionalProperties: true,
          properties: {
            schemaVersion: { type: 'string', enum: [ASSET_PLAN_SCHEMA_VERSION] },
            id: { type: 'string' },
            planHash: { type: 'string' },
          },
        },
        compositionSpec: { type: 'object', additionalProperties: true },
        dryRun: { type: 'boolean' },
      },
    },
    annotations: writeSafe,
  },
  {
    name: 'scene_draft_patch',
    description: 'Dry-run or apply a semantic ScenePatchV1 with optimistic concurrency. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'draftId', 'expectedRevision', 'expectedSceneContentHash', 'patch'],
      properties: {
        ...writeGuardProps,
        patch: patchSchema,
        includePredictedScene: { type: 'boolean' },
      },
    },
    annotations: writeDestructive,
  },
  {
    name: 'scene_draft_undo',
    description: 'Undo scene draft history cursor (does not delete snapshots). Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'draftId', 'expectedRevision', 'expectedSceneContentHash'],
      properties: {
        ...writeGuardProps,
        steps: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
    annotations: writeDestructive,
  },
  {
    name: 'scene_draft_redo',
    description: 'Redo scene draft history cursor. Defaults to dryRun=true.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['requestId', 'draftId', 'expectedRevision', 'expectedSceneContentHash'],
      properties: {
        ...writeGuardProps,
        steps: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
    annotations: writeDestructive,
  },
  {
    name: 'scene_draft_validate',
    description: 'Validate a stored scene draft (current or historical entry) via Scene Graph validator.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['draftId'],
      properties: {
        draftId: { type: 'string' },
        historyEntryId: { type: 'string' },
        analyzeLayout: { type: 'boolean' },
        analysisFrames: { type: 'array', items: { type: 'integer', minimum: 0 } },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'scene_draft_render_preview',
    description: 'Render still or contact-sheet PNG for a stored scene draft via existing Scene Preview Service. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['draftId', 'mode'],
      properties: {
        draftId: { type: 'string' },
        historyEntryId: { type: 'string' },
        mode: { type: 'string', enum: ['still', 'contact-sheet'] },
        frame: { type: 'integer', minimum: 0 },
        frames: { type: 'array', items: { type: 'integer', minimum: 0 } },
        columns: { type: 'integer', minimum: 1, maximum: 8 },
        cellLabelMode: { type: 'string', enum: ['none', 'frame'] },
        outputWidth: {
          type: 'integer',
          minimum: SCENE_LIMITS.MIN_OUTPUT_WIDTH,
          maximum: SCENE_LIMITS.MAX_OUTPUT_WIDTH,
        },
        outputHeight: {
          type: 'integer',
          minimum: SCENE_LIMITS.MIN_OUTPUT_HEIGHT,
          maximum: SCENE_LIMITS.MAX_OUTPUT_HEIGHT,
        },
        cellWidth: { type: 'integer', minimum: 64, maximum: 960 },
      },
    },
    annotations: readOnly,
  },
] as const;

let servicePromise: Promise<SceneDraftStore> | null = null;

async function getService(): Promise<SceneDraftStore> {
  if (!servicePromise) {
    servicePromise = Promise.resolve(createSceneDraftService());
  }
  return servicePromise;
}

export async function resetSceneDraftServiceForTests(root: string): Promise<SceneDraftStore> {
  const service = createSceneDraftService({ root });
  servicePromise = Promise.resolve(service);
  return service;
}

function assertNoAbsolutePaths(value: unknown, path = ''): void {
  if (typeof value === 'string') {
    if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/') || value.includes('\\Users\\') || value.includes('/home/')) {
      throw new Error(`Absolute path leaked at ${path || 'root'}`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoAbsolutePaths(item, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'base64') continue;
      assertNoAbsolutePaths(v, path ? `${path}.${k}` : k);
    }
  }
}

function toErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof SceneDraftError) {
    return {
      code: error.code,
      message: error.message,
      recovery: error.recovery,
      details: error.details,
      diagnostics: error.diagnostics,
    };
  }
  return {
    code: 'SCENE_DRAFT_PREVIEW_FAILED',
    message: error instanceof Error ? error.message : String(error),
    recovery: 'Retry after checking draft id and scene validity',
  };
}

export async function runSceneDraftTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const service = await getService();
  try {
    if (name === 'scene_draft_get_contract') {
      const result = service.getContract(args.format === 'full' ? 'full' : 'summary');
      assertNoAbsolutePaths(result);
      return result;
    }
    if (name === 'scene_draft_list') {
      const result = await service.list({
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        offset: typeof args.offset === 'number' ? args.offset : undefined,
      });
      assertNoAbsolutePaths(result);
      return result;
    }
    if (name === 'scene_draft_get') {
      if (typeof args.draftId !== 'string') {
        return { draft: null, code: 'SCENE_DRAFT_INVALID_ID', message: 'draftId is required', recovery: 'Pass draftId' };
      }
      const detail = await service.get(args.draftId, { includeHistory: args.includeHistory !== false });
      const result = { draft: detail ?? null };
      assertNoAbsolutePaths(result);
      return result;
    }
    if (name === 'scene_draft_create') {
      const result = await service.create({
        requestId: String(args.requestId),
        draftId: String(args.draftId),
        name: String(args.name),
        description: typeof args.description === 'string' ? args.description : undefined,
        scene: args.scene as never,
        dryRun: args.dryRun !== false,
      });
      assertNoAbsolutePaths(result);
      return result;
    }
    if (name === 'scene_draft_compose_asset_plan') {
      const result = await service.composeFromAssetPlan({
        requestId: String(args.requestId),
        plan: args.plan as never,
        compositionSpec: args.compositionSpec as never,
        dryRun: args.dryRun !== false,
      });
      assertNoAbsolutePaths(result);
      return result;
    }
    if (name === 'scene_draft_patch') {
      const result = await service.applyPatch({
        requestId: String(args.requestId),
        draftId: String(args.draftId),
        expectedRevision: Number(args.expectedRevision),
        expectedSceneContentHash: String(args.expectedSceneContentHash),
        patch: args.patch as never,
        includePredictedScene: args.includePredictedScene === true,
        dryRun: args.dryRun !== false,
      });
      assertNoAbsolutePaths(result);
      return result;
    }
    if (name === 'scene_draft_undo' || name === 'scene_draft_redo') {
      const input = {
        requestId: String(args.requestId),
        draftId: String(args.draftId),
        expectedRevision: Number(args.expectedRevision),
        expectedSceneContentHash: String(args.expectedSceneContentHash),
        steps: typeof args.steps === 'number' ? args.steps : undefined,
        dryRun: args.dryRun !== false,
      };
      const result = name === 'scene_draft_undo'
        ? await service.undo(input)
        : await service.redo(input);
      assertNoAbsolutePaths(result);
      return result;
    }
    if (name === 'scene_draft_validate') {
      const result = await service.validate(String(args.draftId), {
        historyEntryId: typeof args.historyEntryId === 'string' ? args.historyEntryId : undefined,
        analyzeLayout: args.analyzeLayout === true,
        analysisFrames: Array.isArray(args.analysisFrames)
          ? args.analysisFrames.filter((v): v is number => typeof v === 'number')
          : undefined,
      });
      assertNoAbsolutePaths(result);
      return result;
    }
    if (name === 'scene_draft_render_preview') {
      if (process.env.BCC_SKIP_SCENE_RENDER === '1') {
        return {
          skipped: true,
          reason: 'BCC_SKIP_SCENE_RENDER=1',
          schemaVersion: SCENE_DRAFT_SCHEMA_VERSION,
          maxHistoryEntries: MAX_SCENE_DRAFT_HISTORY_ENTRIES,
          rootConfigured: Boolean(resolveSceneDraftRoot()),
        };
      }
      const rendered = await service.renderPreview({
        draftId: String(args.draftId),
        historyEntryId: typeof args.historyEntryId === 'string' ? args.historyEntryId : undefined,
        mode: args.mode as 'still' | 'contact-sheet',
        frame: typeof args.frame === 'number' ? args.frame : undefined,
        frames: Array.isArray(args.frames) ? args.frames.filter((v): v is number => typeof v === 'number') : undefined,
        columns: typeof args.columns === 'number' ? args.columns : undefined,
        cellLabelMode: args.cellLabelMode as 'none' | 'frame' | undefined,
        outputWidth: typeof args.outputWidth === 'number' ? args.outputWidth : undefined,
        outputHeight: typeof args.outputHeight === 'number' ? args.outputHeight : undefined,
        cellWidth: typeof args.cellWidth === 'number' ? args.cellWidth : undefined,
      }) as {
        mimeType: string;
        base64: string;
        width: number;
        height: number;
        cacheHit: boolean;
        sceneContentHash: string;
        mode: string;
        frame?: number;
        frames?: number[];
      };
      const { base64, ...meta } = rendered;
      const result = {
        ...meta,
        __images: [{ base64, mimeType: rendered.mimeType }],
      };
      assertNoAbsolutePaths(result);
      return result;
    }
    return {
      code: 'SCENE_DRAFT_NOT_FOUND',
      message: `Unknown tool ${name}`,
      recovery: 'Use scene_draft_get_contract',
    };
  } catch (error) {
    const payload = toErrorPayload(error);
    assertNoAbsolutePaths(payload);
    return payload;
  }
}
