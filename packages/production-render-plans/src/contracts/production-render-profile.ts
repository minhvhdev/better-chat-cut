export type ProductionRenderProfileV1 =
  | { id: 'youtube-1080p-h264'; width?: 1920; height?: 1080 }
  | { id: 'youtube-1440p-h264'; width?: 2560; height?: 1440 }
  | { id: 'youtube-2160p-h264'; width?: 3840; height?: 2160 }
  | { id: 'source-h264'; width?: number; height?: number }
  | { id: 'preview-720p-h264'; width?: 1280; height?: 720 };

export type ResolvedProductionRenderProfileV1 = {
  id: string;
  container: 'mp4';
  width: number;
  height: number;
  fps: number;
  video: {
    codec: 'h264';
    pixelFormat: 'yuv420p';
    crf: number;
    preset: string;
  };
  audio: {
    codec: 'aac';
    sampleRate: 48000;
    channels: 2;
    bitrateKbps: number;
  };
};

export const PRODUCTION_RENDER_PROFILE_IDS = [
  'youtube-1080p-h264',
  'youtube-1440p-h264',
  'youtube-2160p-h264',
  'source-h264',
  'preview-720p-h264',
] as const;

export type ProductionRenderProfileId = (typeof PRODUCTION_RENDER_PROFILE_IDS)[number];
