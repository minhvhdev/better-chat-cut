import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { ensureBetterChatCutMotionRuntime } from '../../../motion-components/src/index.ts';
import type {
  RenderSceneContactSheetInput,
  RenderSceneStillInput,
  SceneContactSheetResult,
  SceneStillResult,
} from '../contracts/scene-preview.ts';
import { createSceneValidator } from '../schema/scene-validator.ts';
import { computeSceneRuntimeRevision } from '../schema/scene-schema.ts';
import { SCENE_PREVIEW_RENDERER_VERSION } from '../contracts/scene-document.ts';
import { defaultContactSheetFrames, resolveStillOutputSize } from './scene-preview-input.ts';
import {
  buildScenePreviewCacheKey,
  readScenePreviewCache,
  writeScenePreviewCache,
} from './scene-preview-cache.ts';
import { ScenePreviewError } from './scene-preview-errors.ts';

ensureBetterChatCutMotionRuntime();

let bundlePromise: Promise<string> | null = null;

function webpackOverride(config: Record<string, unknown>) {
  const resolve = (config.resolve ?? {}) as Record<string, unknown>;
  const module = (config.module ?? {}) as Record<string, unknown>;
  const extensionAlias = (resolve.extensionAlias ?? {}) as Record<string, unknown>;
  const rules = Array.isArray(module.rules) ? module.rules : [];
  return {
    ...config,
    resolve: {
      ...resolve,
      extensionAlias: {
        ...extensionAlias,
        '.js': ['.js', '.ts', '.tsx'],
      },
    },
    module: {
      ...module,
      rules: [...rules, { test: /\.frag$/, type: 'asset/source' }],
    },
  };
}

async function getServeUrl(): Promise<string> {
  if (!bundlePromise) {
    const entry = join(process.cwd(), 'remotion', 'index.ts');
    const publicDir = join(process.cwd(), 'assets');
    bundlePromise = bundle({
      entryPoint: entry,
      publicDir,
      webpackOverride: webpackOverride as never,
    });
  }
  return bundlePromise;
}

export interface ScenePreviewService {
  renderStill(input: RenderSceneStillInput): Promise<SceneStillResult>;
  renderContactSheet(input: RenderSceneContactSheetInput): Promise<SceneContactSheetResult>;
}

export function createScenePreviewService(): ScenePreviewService {
  const validator = createSceneValidator();

  return {
    async renderStill(input) {
      const validated = await validator.validate(input.scene, {
        includeNormalizedScene: true,
        includeDependencies: true,
        analyzeLayout: false,
      });
      if (!validated.valid || !validated.normalizedScene) {
        throw new ScenePreviewError('SCENE_RENDER_FAILED', 'Scene failed validation before render', {
          details: { errors: validated.errors },
          recovery: 'Fix scene diagnostics then retry',
        });
      }
      const scene = validated.normalizedScene;
      if (!Number.isInteger(input.frame) || input.frame < 0 || input.frame >= scene.durationInFrames) {
        throw new ScenePreviewError('SCENE_INVALID_FRAME', `Invalid frame ${input.frame}`, {
          recovery: `Use 0..${scene.durationInFrames - 1}`,
        });
      }
      const size = resolveStillOutputSize({
        scene,
        outputWidth: input.outputWidth,
        outputHeight: input.outputHeight,
      });
      if (size.diagnostics.some((d) => d.severity === 'error')) {
        throw new ScenePreviewError('SCENE_PREVIEW_TOO_LARGE', size.diagnostics[0].message, {
          recovery: size.diagnostics[0].recovery,
        });
      }

      const sceneRuntimeRevision = computeSceneRuntimeRevision();
      const cacheKey = buildScenePreviewCacheKey({
        sceneContentHash: validated.sceneContentHash,
        dependencyFingerprint: validated.dependencyFingerprint,
        sceneRuntimeRevision,
        motionRuntimeRevision: validated.motionRuntimeRevision,
        mode: 'still',
        frame: input.frame,
        width: size.width,
        height: size.height,
        previewRendererVersion: SCENE_PREVIEW_RENDERER_VERSION,
      });

      const cached = await readScenePreviewCache(cacheKey);
      if (cached) {
        return {
          sceneId: scene.id,
          sceneContentHash: validated.sceneContentHash!,
          dependencyFingerprint: validated.dependencyFingerprint!,
          catalogRevision: validated.catalogRevision!,
          motionRuntimeRevision: validated.motionRuntimeRevision!,
          sceneRuntimeRevision,
          mode: 'still',
          frame: input.frame,
          width: size.width,
          height: size.height,
          mimeType: 'image/png',
          byteLength: cached.byteLength,
          cacheKey,
          cacheHit: true,
          diagnostics: validated.warnings,
          base64: cached.toString('base64'),
        };
      }

      const serveUrl = await getServeUrl();
      const inputProps = {
        scene,
        frame: input.frame,
        width: size.width,
        height: size.height,
      };
      const composition = await selectComposition({
        serveUrl,
        id: 'BetterChatCutSceneStill',
        inputProps,
      });
      const { buffer } = await renderStill({
        serveUrl,
        composition,
        inputProps,
        frame: 0,
        imageFormat: 'png',
      });
      if (!buffer) {
        throw new ScenePreviewError('SCENE_RENDER_FAILED', 'Remotion returned empty buffer');
      }
      const png = Buffer.from(buffer);
      await writeScenePreviewCache(cacheKey, png);

      return {
        sceneId: scene.id,
        sceneContentHash: validated.sceneContentHash!,
        dependencyFingerprint: validated.dependencyFingerprint!,
        catalogRevision: validated.catalogRevision!,
        motionRuntimeRevision: validated.motionRuntimeRevision!,
        sceneRuntimeRevision,
        mode: 'still',
        frame: input.frame,
        width: size.width,
        height: size.height,
        mimeType: 'image/png',
        byteLength: png.byteLength,
        cacheKey,
        cacheHit: false,
        diagnostics: validated.warnings,
        base64: png.toString('base64'),
      };
    },

    async renderContactSheet(input) {
      const validated = await validator.validate(input.scene, {
        includeNormalizedScene: true,
        includeDependencies: true,
        analyzeLayout: false,
      });
      if (!validated.valid || !validated.normalizedScene) {
        throw new ScenePreviewError('SCENE_CONTACT_SHEET_FAILED', 'Scene failed validation before render', {
          details: { errors: validated.errors },
          recovery: 'Fix scene diagnostics then retry',
        });
      }
      const scene = validated.normalizedScene;
      const frames = (input.frames?.length ? input.frames : defaultContactSheetFrames(scene.durationInFrames))
        .filter((frame, index, arr) => arr.indexOf(frame) === index)
        .sort((a, b) => a - b);
      for (const frame of frames) {
        if (!Number.isInteger(frame) || frame < 0 || frame >= scene.durationInFrames) {
          throw new ScenePreviewError('SCENE_INVALID_FRAME', `Invalid contact-sheet frame ${frame}`);
        }
      }
      const columns = input.columns ?? Math.min(frames.length, 3);
      const cellLabelMode = input.cellLabelMode ?? 'frame';
      const cellWidth = input.cellWidth ?? Math.min(640, Math.floor(scene.canvas.width / 2));
      const rows = Math.ceil(frames.length / columns);
      const width = cellWidth * columns;
      const height = Math.round(cellWidth * (scene.canvas.height / scene.canvas.width)) * rows;

      const sceneRuntimeRevision = computeSceneRuntimeRevision();
      const cacheKey = buildScenePreviewCacheKey({
        sceneContentHash: validated.sceneContentHash,
        dependencyFingerprint: validated.dependencyFingerprint,
        sceneRuntimeRevision,
        motionRuntimeRevision: validated.motionRuntimeRevision,
        mode: 'contact-sheet',
        frames,
        columns,
        cellLabelMode,
        cellWidth,
        width,
        height,
        previewRendererVersion: SCENE_PREVIEW_RENDERER_VERSION,
      });

      const cached = await readScenePreviewCache(cacheKey);
      if (cached) {
        return {
          sceneId: scene.id,
          sceneContentHash: validated.sceneContentHash!,
          dependencyFingerprint: validated.dependencyFingerprint!,
          catalogRevision: validated.catalogRevision!,
          motionRuntimeRevision: validated.motionRuntimeRevision!,
          sceneRuntimeRevision,
          mode: 'contact-sheet',
          frames,
          width,
          height,
          mimeType: 'image/png',
          byteLength: cached.byteLength,
          cacheKey,
          cacheHit: true,
          diagnostics: validated.warnings,
          base64: cached.toString('base64'),
        };
      }

      const serveUrl = await getServeUrl();
      const inputProps = {
        scene,
        frames,
        columns,
        cellLabelMode,
        cellWidth,
        width,
        height,
      };
      const composition = await selectComposition({
        serveUrl,
        id: 'BetterChatCutSceneContactSheet',
        inputProps,
      });
      const { buffer } = await renderStill({
        serveUrl,
        composition,
        inputProps,
        frame: 0,
        imageFormat: 'png',
      });
      if (!buffer) {
        throw new ScenePreviewError('SCENE_CONTACT_SHEET_FAILED', 'Remotion returned empty buffer');
      }
      const png = Buffer.from(buffer);
      await writeScenePreviewCache(cacheKey, png);

      return {
        sceneId: scene.id,
        sceneContentHash: validated.sceneContentHash!,
        dependencyFingerprint: validated.dependencyFingerprint!,
        catalogRevision: validated.catalogRevision!,
        motionRuntimeRevision: validated.motionRuntimeRevision!,
        sceneRuntimeRevision,
        mode: 'contact-sheet',
        frames,
        width,
        height,
        mimeType: 'image/png',
        byteLength: png.byteLength,
        cacheKey,
        cacheHit: false,
        diagnostics: validated.warnings,
        base64: png.toString('base64'),
      };
    },
  };
}
