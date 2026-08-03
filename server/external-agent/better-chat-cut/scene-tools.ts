import {
  SCENE_LIMITS,
  SCENE_SCHEMA_VERSION,
  BASIC_EXPLAINER_SCENE,
  computeSceneRuntimeRevision,
  createSceneValidator,
  createSceneFrameEvaluator,
  createScenePreviewService,
  ScenePreviewError,
  getSceneRuntimeCapabilities,
  normalizeSceneDocument,
} from '../../../packages/scene-graph/src/index.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const sceneObjectSchema = {
  type: 'object',
  description: 'Inline SceneDocumentV1 JSON. Exact asset/animation/theme id+version required. No paths, URLs, or source code.',
  additionalProperties: true,
  properties: {
    schemaVersion: { type: 'string', enum: [SCENE_SCHEMA_VERSION] },
    id: { type: 'string' },
    name: { type: 'string' },
    canvas: { type: 'object' },
    fps: { type: 'number', minimum: SCENE_LIMITS.MIN_FPS, maximum: SCENE_LIMITS.MAX_FPS },
    durationInFrames: {
      type: 'integer',
      minimum: SCENE_LIMITS.MIN_DURATION_FRAMES,
      maximum: SCENE_LIMITS.MAX_DURATION_FRAMES,
    },
    theme: { type: 'object' },
    nodes: { type: 'array' },
  },
} as const;

export const SCENE_TOOLS = [
  {
    name: 'scene_get_contract',
    description: 'Return Better Chat Cut Scene Graph v1 contract, limits, transform/timing semantics, and an example scene. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['summary', 'full'], description: 'summary or full contract payload' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'scene_validate',
    description: 'Validate and optionally analyze an inline SceneDocumentV1. Does not save scenes or mutate projects.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['scene'],
      properties: {
        scene: sceneObjectSchema,
        includeNormalizedScene: { type: 'boolean' },
        includeDependencies: { type: 'boolean' },
        analyzeLayout: { type: 'boolean' },
        analysisFrames: {
          type: 'array',
          items: { type: 'integer', minimum: 0 },
        },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'scene_evaluate_frame',
    description: 'Evaluate world transforms, opacity, bounds, and visibility for one scene frame. No PNG render.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['scene', 'frame'],
      properties: {
        scene: sceneObjectSchema,
        frame: { type: 'integer', minimum: 0 },
        includeInactiveNodes: { type: 'boolean' },
      },
    },
    annotations: readOnly,
  },
  {
    name: 'scene_render_preview',
    description: 'Render a PNG still or contact-sheet for an inline scene via Remotion. Read-only; does not mutate project/timeline.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['scene', 'mode'],
      properties: {
        scene: sceneObjectSchema,
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

function sceneContract(format: 'summary' | 'full') {
  const summary = {
    schemaVersion: SCENE_SCHEMA_VERSION,
    sceneRuntimeRevision: computeSceneRuntimeRevision(),
    nodeTypes: ['group', 'asset'],
    coordinateSystem: {
      origin: 'top-left',
      x: 'right',
      y: 'down',
      childSpace: 'parent content box top-left',
    },
    transformOrder: [
      'layout translation',
      'anchor translation',
      'animation translation',
      'rotation',
      'scale',
      'reverse anchor translation',
    ],
    timingSemantics: '[startFrame, endFrame) half-open; child visible only when all ancestors active',
    animationSemantics: {
      composition: { x: 'add', y: 'add', rotation: 'add', scale: 'multiply', opacity: 'multiply' },
      localFrame: 'sceneFrame - node.startFrame',
    },
    limits: SCENE_LIMITS,
    allowedAssetStatuses: ['staging', 'published', 'deprecated(exact+warning)'],
    disallowedAssetStatuses: ['draft'],
    exactVersionPolicy: 'Asset, animation, and theme references must pin exact id+version; no latest fallback',
    previewModes: ['still', 'contact-sheet'],
    capabilities: getSceneRuntimeCapabilities(),
    exampleScene: BASIC_EXPLAINER_SCENE,
  };
  if (format === 'summary') return summary;
  return {
    ...summary,
    validationRules: [
      'JSON-serializable only',
      'No executable code, paths, URLs, or TSX',
      'Unique node ids; parents must be groups; no cycles; depth <= 8',
      'Props validated by M2A motion props validator',
      'Draft candidate runtimes are rejected',
    ],
  };
}

export async function runSceneTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'scene_get_contract') {
    const format = args.format === 'full' ? 'full' : 'summary';
    return sceneContract(format);
  }

  if (name === 'scene_validate') {
    const validator = createSceneValidator();
    const result = await validator.validate(args.scene, {
      includeNormalizedScene: args.includeNormalizedScene === true,
      includeDependencies: args.includeDependencies !== false,
      analyzeLayout: args.analyzeLayout !== false,
      analysisFrames: Array.isArray(args.analysisFrames)
        ? args.analysisFrames.filter((v): v is number => typeof v === 'number')
        : undefined,
    });
    return {
      valid: result.valid,
      sceneId: result.normalizedScene?.id,
      sceneContentHash: result.sceneContentHash,
      dependencyFingerprint: result.dependencyFingerprint,
      catalogRevision: result.catalogRevision,
      motionRuntimeRevision: result.motionRuntimeRevision,
      sceneRuntimeRevision: result.sceneRuntimeRevision,
      normalizedScene: args.includeNormalizedScene === true ? result.normalizedScene : undefined,
      dependencies: result.dependencies,
      layoutAnalysis: result.layoutAnalysis,
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  if (name === 'scene_evaluate_frame') {
    if (typeof args.frame !== 'number' || !Number.isInteger(args.frame)) {
      return {
        code: 'SCENE_INVALID_FRAME',
        message: 'frame must be an integer',
        recovery: 'Pass an integer frame index',
      };
    }
    const normalized = normalizeSceneDocument(args.scene);
    if (!normalized.success) {
      return {
        code: 'SCENE_EVALUATION_FAILED',
        message: 'Scene failed normalization',
        details: { errors: normalized.errors },
        recovery: 'Fix schema errors then retry',
      };
    }
    const validator = createSceneValidator();
    const validated = await validator.validate(normalized.scene, {
      includeNormalizedScene: true,
      analyzeLayout: false,
    });
    if (!validated.valid || !validated.normalizedScene) {
      return {
        code: 'SCENE_EVALUATION_FAILED',
        message: 'Scene failed validation',
        details: { errors: validated.errors },
        recovery: 'Fix validation errors then retry',
      };
    }
    try {
      const evaluator = createSceneFrameEvaluator();
      const evaluation = await evaluator.evaluate(validated.normalizedScene, args.frame);
      const includeInactive = args.includeInactiveNodes === true;
      return {
        ...evaluation,
        nodes: includeInactive
          ? evaluation.nodes
          : evaluation.nodes.filter((node) => node.active),
      };
    } catch (error) {
      const err = error as { code?: string; message?: string; recovery?: string; details?: unknown };
      return {
        code: err.code ?? 'SCENE_EVALUATION_FAILED',
        message: err.message ?? String(error),
        details: err.details,
        recovery: err.recovery ?? 'Check frame range and dependencies',
      };
    }
  }

  if (name === 'scene_render_preview') {
    if (process.env.BCC_SKIP_SCENE_RENDER === '1') {
      return {
        skipped: true,
        reason: 'BCC_SKIP_SCENE_RENDER=1',
        sceneRuntimeRevision: computeSceneRuntimeRevision(),
      };
    }
    const mode = args.mode;
    if (mode !== 'still' && mode !== 'contact-sheet') {
      return {
        code: 'SCENE_RENDER_FAILED',
        message: 'mode must be still or contact-sheet',
        recovery: 'Set mode explicitly',
      };
    }
    if (mode === 'still') {
      if (args.frames !== undefined || args.columns !== undefined || args.cellLabelMode !== undefined) {
        return {
          code: 'SCENE_RENDER_FAILED',
          message: 'frames/columns/cellLabelMode are only valid for contact-sheet mode',
          recovery: 'Remove contact-sheet-only fields',
        };
      }
    } else if (args.frame !== undefined) {
      return {
        code: 'SCENE_RENDER_FAILED',
        message: 'frame is only valid for still mode',
        recovery: 'Use frames for contact-sheet',
      };
    }

    const preview = createScenePreviewService();
    try {
      if (mode === 'still') {
        const rendered = await preview.renderStill({
          scene: args.scene as never,
          frame: typeof args.frame === 'number' ? args.frame : 0,
          outputWidth: typeof args.outputWidth === 'number' ? args.outputWidth : undefined,
          outputHeight: typeof args.outputHeight === 'number' ? args.outputHeight : undefined,
        });
        const { base64, ...meta } = rendered;
        return {
          ...meta,
          __images: [{ base64, mimeType: rendered.mimeType, frame: rendered.frame }],
        };
      }
      const rendered = await preview.renderContactSheet({
        scene: args.scene as never,
        frames: Array.isArray(args.frames) ? args.frames as number[] : undefined,
        columns: typeof args.columns === 'number' ? args.columns : undefined,
        cellLabelMode: args.cellLabelMode === 'none' || args.cellLabelMode === 'frame'
          ? args.cellLabelMode
          : undefined,
        cellWidth: typeof args.cellWidth === 'number' ? args.cellWidth : undefined,
      });
      const { base64, ...meta } = rendered;
      return {
        ...meta,
        __images: [{ base64, mimeType: rendered.mimeType }],
      };
    } catch (error) {
      if (error instanceof ScenePreviewError) {
        return error.toJSON();
      }
      return {
        code: 'SCENE_RENDER_FAILED',
        message: error instanceof Error ? error.message : String(error),
        recovery: 'Validate the scene and retry',
      };
    }
  }

  return undefined;
}
