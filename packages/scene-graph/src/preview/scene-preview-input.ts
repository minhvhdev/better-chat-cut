import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import { SCENE_LIMITS } from '../contracts/scene-document.ts';
import { diagnostic } from '../contracts/scene-errors.ts';

export function defaultContactSheetFrames(durationInFrames: number): number[] {
  const picks = [
    0,
    Math.floor(durationInFrames * 0.2),
    Math.floor(durationInFrames * 0.4),
    Math.floor(durationInFrames * 0.6),
    Math.floor(durationInFrames * 0.8),
    Math.max(0, durationInFrames - 1),
  ];
  return [...new Set(picks)].filter((frame) => frame >= 0 && frame < durationInFrames).sort((a, b) => a - b);
}

export function resolveStillOutputSize(args: {
  scene: SceneDocumentV1;
  outputWidth?: number;
  outputHeight?: number;
}): { width: number; height: number; diagnostics: ReturnType<typeof diagnostic>[] } {
  const diagnostics = [];
  const aspect = args.scene.canvas.width / args.scene.canvas.height;
  let width = args.outputWidth ?? args.scene.canvas.width;
  let height = args.outputHeight ?? args.scene.canvas.height;

  if (args.outputWidth != null && args.outputHeight == null) {
    height = Math.round(width / aspect);
  } else if (args.outputHeight != null && args.outputWidth == null) {
    width = Math.round(height * aspect);
  } else if (args.outputWidth != null && args.outputHeight != null) {
    // Keep aspect: fit inside requested box
    const scale = Math.min(args.outputWidth / args.scene.canvas.width, args.outputHeight / args.scene.canvas.height);
    width = Math.round(args.scene.canvas.width * scale);
    height = Math.round(args.scene.canvas.height * scale);
  }

  if (width < SCENE_LIMITS.MIN_OUTPUT_WIDTH || width > SCENE_LIMITS.MAX_OUTPUT_WIDTH
    || height < SCENE_LIMITS.MIN_OUTPUT_HEIGHT || height > SCENE_LIMITS.MAX_OUTPUT_HEIGHT) {
    diagnostics.push(diagnostic('error', 'SCENE_PREVIEW_TOO_LARGE', 'Output dimensions out of allowed preview range', {
      recovery: `Use width ${SCENE_LIMITS.MIN_OUTPUT_WIDTH}..${SCENE_LIMITS.MAX_OUTPUT_WIDTH} and height ${SCENE_LIMITS.MIN_OUTPUT_HEIGHT}..${SCENE_LIMITS.MAX_OUTPUT_HEIGHT}`,
    }));
  }
  return { width, height, diagnostics };
}
