import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import {
  computeRuntimeRevision,
  ensureBetterChatCutMotionRuntime,
  getMotionAnimation,
  getMotionComponent,
  getMotionTheme,
  validateMotionProps,
  type MotionAssetPreviewInput,
} from '../index.ts';

ensureBetterChatCutMotionRuntime();

let bundlePromise: Promise<string> | null = null;

/** Match remotion/render.mjs webpack so `.js` imports resolve to `.ts`/`.tsx`. */
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
      // Keep webpack quieter in agent runs.
      webpackOverride: webpackOverride as never,
    });
  }
  return bundlePromise;
}

function previewCacheDir(): string {
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'preview-cache');
}

function cacheKey(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export type MotionStillResult = {
  assetId: string;
  assetVersion: string;
  runtimeRevision: string;
  themeId: string;
  frame: number;
  width: number;
  height: number;
  mimeType: 'image/png';
  base64: string;
  cacheKey: string;
  cacheHit: boolean;
  compositionId: string;
};

export async function renderMotionPreview(input: MotionAssetPreviewInput & {
  mode?: 'still' | 'contact-sheet';
  frame?: number;
}): Promise<MotionStillResult> {
  const definition = getMotionComponent(input.assetId, input.version);
  if (!definition) {
    throw new Error(`Runtime definition missing for ${input.assetId}`);
  }
  const themeId = input.themeId ?? 'default';
  if (!getMotionTheme(themeId)) {
    throw new Error(`Unknown theme ${themeId}`);
  }
  if (input.animationId && !getMotionAnimation(input.animationId)) {
    throw new Error(`Unknown animation ${input.animationId}`);
  }
  const validated = validateMotionProps(definition.propsSchema, input.props ?? {}, definition.defaultProps);
  if (!validated.valid) {
    throw new Error(validated.errors.map((error) => error.message).join('; '));
  }

  const mode = input.mode ?? 'still';
  const compositionId = mode === 'contact-sheet' ? 'BetterChatCutAssetContactSheet' : 'BetterChatCutAssetStill';
  const frame = mode === 'contact-sheet'
    ? 0
    : (input.frame ?? definition.preview.stillFrame);
  const width = input.width ?? definition.preview.width;
  const height = input.height ?? definition.preview.height;
  const key = cacheKey({
    compositionId,
    assetId: definition.assetId,
    assetVersion: definition.assetVersion,
    props: validated.normalizedProps,
    themeId,
    animationId: input.animationId ?? null,
    frame,
    width,
    height,
    runtimeRevision: computeRuntimeRevision(),
  });

  const cacheDir = previewCacheDir();
  await mkdir(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `${key}.png`);
  try {
    const cached = await readFile(cachePath);
    return {
      assetId: definition.assetId,
      assetVersion: definition.assetVersion,
      runtimeRevision: computeRuntimeRevision(),
      themeId,
      frame,
      width,
      height,
      mimeType: 'image/png',
      base64: cached.toString('base64'),
      cacheKey: key,
      cacheHit: true,
      compositionId,
    };
  } catch {
    // cache miss
  }

  const serveUrl = await getServeUrl();
  const inputProps = {
    ...input,
    props: validated.normalizedProps,
    themeId,
    mode: mode === 'contact-sheet' ? 'contact-sheet' : 'still',
    frame,
  };
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  });
  const { buffer } = await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame,
    imageFormat: 'png',
  });
  if (!buffer) throw new Error('Remotion renderStill returned empty buffer');
  await writeFile(cachePath, buffer);

  return {
    assetId: definition.assetId,
    assetVersion: definition.assetVersion,
    runtimeRevision: computeRuntimeRevision(),
    themeId,
    frame,
    width,
    height,
    mimeType: 'image/png',
    base64: Buffer.from(buffer).toString('base64'),
    cacheKey: key,
    cacheHit: false,
    compositionId,
  };
}

export function inspectMotionAsset(assetId: string, version?: string) {
  ensureBetterChatCutMotionRuntime();
  const definition = getMotionComponent(assetId, version);
  if (!definition) {
    return {
      runtimeRevision: computeRuntimeRevision(),
      asset: null,
      diagnostics: [{
        severity: 'error',
        code: 'runtime_missing',
        message: `No runtime registration for ${assetId}${version ? `@${version}` : ''}`,
      }],
    };
  }
  return {
    runtimeRevision: computeRuntimeRevision(),
    asset: {
      id: definition.assetId,
      version: definition.assetVersion,
      name: definition.displayName,
      description: definition.description,
      kind: definition.kind,
      runtimeAvailable: true,
      defaultProps: definition.defaultProps,
      propsSchema: definition.propsSchema,
      preview: definition.preview,
      supportedThemes: definition.supportedThemes ?? listThemeIds(),
      supportedAnimations: definition.supportedAnimations ?? [],
    },
    diagnostics: [],
  };
}

function listThemeIds(): string[] {
  return ['default', 'high-contrast'];
}
