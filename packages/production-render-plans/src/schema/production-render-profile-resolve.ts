import type { ProductionRenderProfileV1, ResolvedProductionRenderProfileV1 } from '../contracts/production-render-profile.ts';
import { MAX_OUTPUT_HEIGHT, MAX_OUTPUT_WIDTH, MIN_OUTPUT_HEIGHT, MIN_OUTPUT_WIDTH } from '../contracts/production-render-policy.ts';
import { productionRenderDiagnostic, type ProductionRenderDiagnostic } from '../contracts/production-render-errors.ts';

const PROFILE_DEFAULTS: Record<string, { width: number; height: number; crf: number; preset: string; audioKbps: number }> = {
  'youtube-1080p-h264': { width: 1920, height: 1080, crf: 18, preset: 'medium', audioKbps: 192 },
  'youtube-1440p-h264': { width: 2560, height: 1440, crf: 18, preset: 'medium', audioKbps: 192 },
  'youtube-2160p-h264': { width: 3840, height: 2160, crf: 18, preset: 'medium', audioKbps: 192 },
  'preview-720p-h264': { width: 1280, height: 720, crf: 23, preset: 'veryfast', audioKbps: 128 },
  'source-h264': { width: 0, height: 0, crf: 18, preset: 'medium', audioKbps: 192 },
};

export function resolveProductionRenderProfile(input: {
  profile: ProductionRenderProfileV1;
  timelineWidth: number;
  timelineHeight: number;
  fps: number;
}): { profile?: ResolvedProductionRenderProfileV1; errors: ProductionRenderDiagnostic[] } {
  const errors: ProductionRenderDiagnostic[] = [];
  const defaults = PROFILE_DEFAULTS[input.profile.id];
  if (!defaults) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_PROFILE_INVALID', `Unknown profile ${input.profile.id}`, {
      recovery: 'Use a predefined profile id such as youtube-1080p-h264 or preview-720p-h264',
    }));
    return { errors };
  }

  let width = typeof input.profile.width === 'number' ? input.profile.width : defaults.width;
  let height = typeof input.profile.height === 'number' ? input.profile.height : defaults.height;

  if (input.profile.id === 'source-h264') {
    width = typeof input.profile.width === 'number' ? input.profile.width : input.timelineWidth;
    height = typeof input.profile.height === 'number' ? input.profile.height : input.timelineHeight;
    if (typeof input.profile.width === 'number' && typeof input.profile.height !== 'number') {
      height = Math.round(width * (input.timelineHeight / input.timelineWidth));
    } else if (typeof input.profile.height === 'number' && typeof input.profile.width !== 'number') {
      width = Math.round(height * (input.timelineWidth / input.timelineHeight));
    }
  }

  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < MIN_OUTPUT_WIDTH || width > MAX_OUTPUT_WIDTH
    || height < MIN_OUTPUT_HEIGHT || height > MAX_OUTPUT_HEIGHT) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_PROFILE_INVALID', `Output dimensions ${width}x${height} out of bounds`, {
      recovery: `Keep width in ${MIN_OUTPUT_WIDTH}..${MAX_OUTPUT_WIDTH} and height in ${MIN_OUTPUT_HEIGHT}..${MAX_OUTPUT_HEIGHT}`,
    }));
    return { errors };
  }

  if (!Number.isFinite(input.fps) || input.fps <= 0) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_PROFILE_INVALID', 'Timeline FPS must be positive', {
      recovery: 'Fix the timeline fps before preparing a production render',
    }));
    return { errors };
  }

  return {
    profile: {
      id: input.profile.id,
      container: 'mp4',
      width,
      height,
      fps: input.fps,
      video: {
        codec: 'h264',
        pixelFormat: 'yuv420p',
        crf: defaults.crf,
        preset: defaults.preset,
      },
      audio: {
        codec: 'aac',
        sampleRate: 48000,
        channels: 2,
        bitrateKbps: defaults.audioKbps,
      },
    },
    errors,
  };
}
