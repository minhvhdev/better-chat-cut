import type { ProductionRenderDiagnostic } from '../../../production-render-plans/src/contracts/production-render-errors.ts';

export type ProductionQaRangeV1 = {
  startMs: number;
  endMs: number;
  durationMs: number;
  expected?: boolean;
  reason?: string;
};

export type ProductionQaFrameSampleV1 = {
  frame: number;
  relativeFrame: number;
  timestampMs: number;
  reasons: string[];
  rendered: boolean;
  pixelHash?: string;
  averageLuminance?: number;
  pixelDifferenceFromPrevious?: number;
  mostlyBlack?: boolean;
  identicalToPrevious?: boolean;
  error?: ProductionRenderDiagnostic;
};

export type ProductionSubtitleQaResultV1 = {
  role: 'subtitle-srt' | 'subtitle-vtt';
  valid: boolean;
  cueCount: number;
  errors: ProductionRenderDiagnostic[];
  warnings: ProductionRenderDiagnostic[];
};

export type ProductionQaCheckResultV1 = {
  id: string;
  category: 'source' | 'video' | 'audio' | 'subtitle' | 'caption-sync' | 'render' | 'delivery';
  status: 'passed' | 'warning' | 'failed' | 'skipped';
  message: string;
  expected?: unknown;
  actual?: unknown;
  recovery?: string;
};

export type ProductionQaReportV1 = {
  schemaVersion: '1.0.0';
  bundleId: string;
  planHash: string;
  status: 'passed' | 'passed-with-warnings' | 'failed';
  media: {
    container: string;
    durationMs: number;
    video?: {
      codec: string;
      width: number;
      height: number;
      fpsNumerator?: number;
      fpsDenominator?: number;
      fps: number;
      frameCount?: number;
      pixelFormat?: string;
    };
    audio?: {
      codec: string;
      sampleRate?: number;
      channels?: number;
      durationMs?: number;
      integratedLufs?: number;
      peakDbfs?: number;
    };
  };
  frameSamples: ProductionQaFrameSampleV1[];
  blackFrameRanges: ProductionQaRangeV1[];
  frozenFrameRanges: ProductionQaRangeV1[];
  silenceRanges: ProductionQaRangeV1[];
  subtitles: ProductionSubtitleQaResultV1[];
  checks: ProductionQaCheckResultV1[];
  errors: ProductionRenderDiagnostic[];
  warnings: ProductionRenderDiagnostic[];
  reportHash: string;
  generatedAt: string;
};

export type ProductionQualityGateResult = {
  pass: boolean;
  status: 'passed' | 'passed-with-warnings' | 'failed';
  blockingCheckIds: string[];
  warningCheckIds: string[];
};
