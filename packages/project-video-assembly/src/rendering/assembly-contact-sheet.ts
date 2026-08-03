import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { ensureBetterChatCutMotionRuntime } from '../../../motion-components/src/index.ts';
import type { TimelineState } from '../../../../src/editor/types.ts';

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

export function shouldSkipAssemblyRender(): boolean {
  return process.env.BCC_SKIP_ASSEMBLY_RENDER === '1'
    || process.argv.includes('--skip-render');
}

export async function renderTimelineStill(input: {
  state: TimelineState;
  frame: number;
  scale?: number;
}): Promise<{
  png: Buffer;
  width: number;
  height: number;
  pixelHash: string;
  fullyTransparent: boolean;
  mostlyBlack: boolean;
}> {
  const serveUrl = await getServeUrl();
  const scale = input.scale ?? 0.25;
  const inputProps = { state: input.state, transparent: false };
  const composition = await selectComposition({
    serveUrl,
    id: 'timeline',
    inputProps,
  });
  const { buffer } = await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame: input.frame,
    imageFormat: 'png',
    scale,
  });
  if (!buffer) throw new Error('Remotion renderStill returned empty buffer');
  const png = Buffer.from(buffer);
  const pixelHash = createHash('sha256').update(png).digest('hex');
  // Heuristic without full PNG decode: tiny/empty buffers are suspicious.
  const fullyTransparent = png.byteLength < 200;
  const mostlyBlack = png.byteLength < 1500;
  return {
    png,
    width: Math.max(1, Math.round(input.state.width * scale)),
    height: Math.max(1, Math.round(input.state.height * scale)),
    pixelHash,
    fullyTransparent,
    mostlyBlack,
  };
}

export async function renderAssemblyContactSheet(input: {
  state: TimelineState;
  frames: number[];
  columns: number;
}): Promise<{
  png: Buffer;
  width: number;
  height: number;
  frames: number[];
  columns: number;
}> {
  const serveUrl = await getServeUrl();
  const columns = Math.max(1, input.columns);
  const frames = input.frames;
  const cellScale = 0.2;
  const cellW = Math.max(1, Math.round(input.state.width * cellScale));
  const cellH = Math.max(1, Math.round(input.state.height * cellScale));
  const rows = Math.max(1, Math.ceil(frames.length / columns));
  const inputProps = {
    state: input.state,
    frames,
    columns,
    cellWidth: cellW,
    cellHeight: cellH,
  };
  const composition = await selectComposition({
    serveUrl,
    id: 'BetterChatCutAssemblyContactSheet',
    inputProps,
  });
  const { buffer } = await renderStill({
    serveUrl,
    composition: {
      ...composition,
      width: cellW * columns,
      height: cellH * rows,
      durationInFrames: 1,
      fps: input.state.fps,
    },
    inputProps,
    frame: 0,
    imageFormat: 'png',
  });
  if (!buffer) throw new Error('Remotion contact sheet returned empty buffer');
  return {
    png: Buffer.from(buffer),
    width: cellW * columns,
    height: cellH * rows,
    frames,
    columns,
  };
}
