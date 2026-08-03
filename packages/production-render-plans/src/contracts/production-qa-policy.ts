export type ProductionQaPolicyV1 = {
  qualityGate: 'strict' | 'balanced';
  requireVideoStream: boolean;
  requireAudioStream: boolean;
  requireSubtitlesWhenRequested: boolean;
  durationToleranceMs: number;
  audioVideoDurationToleranceMs: number;
  sampleFrameLimit: number;
  allowStagingDependencies?: boolean;
  blackFrame?: {
    enabled: boolean;
    luminanceThreshold: number;
    minimumRunMs: number;
    failOnUnexpectedFullRangeBlack: boolean;
  };
  frozenFrame?: {
    enabled: boolean;
    minimumRunMs: number;
    pixelDifferenceThreshold: number;
  };
  silence?: {
    enabled: boolean;
    thresholdDb: number;
    minimumRunMs: number;
    failIfEntireExpectedNarrationSilent: boolean;
  };
  loudness?: {
    enabled: boolean;
    minimumIntegratedLufs?: number;
    maximumIntegratedLufs?: number;
    maximumPeakDbfs?: number;
  };
  subtitle?: {
    requireMonotonicCues: boolean;
    requireCueBoundsWithinRender: boolean;
    maximumTimingDifferenceMs: number;
  };
  contactSheet?: {
    enabled: boolean;
    columns: number;
    maximumFrames: number;
  };
};

export const DEFAULT_PRODUCTION_QA_POLICY: ProductionQaPolicyV1 = {
  qualityGate: 'balanced',
  requireVideoStream: true,
  requireAudioStream: true,
  requireSubtitlesWhenRequested: true,
  durationToleranceMs: 250,
  audioVideoDurationToleranceMs: 500,
  sampleFrameLimit: 60,
  allowStagingDependencies: false,
  blackFrame: {
    enabled: true,
    luminanceThreshold: 0.02,
    minimumRunMs: 1500,
    failOnUnexpectedFullRangeBlack: true,
  },
  frozenFrame: {
    enabled: true,
    minimumRunMs: 5000,
    pixelDifferenceThreshold: 0.002,
  },
  silence: {
    enabled: true,
    thresholdDb: -50,
    minimumRunMs: 2000,
    failIfEntireExpectedNarrationSilent: true,
  },
  loudness: {
    enabled: true,
    minimumIntegratedLufs: -24,
    maximumIntegratedLufs: -8,
    maximumPeakDbfs: -0.1,
  },
  subtitle: {
    requireMonotonicCues: true,
    requireCueBoundsWithinRender: true,
    maximumTimingDifferenceMs: 120,
  },
  contactSheet: {
    enabled: true,
    columns: 5,
    maximumFrames: 40,
  },
};
