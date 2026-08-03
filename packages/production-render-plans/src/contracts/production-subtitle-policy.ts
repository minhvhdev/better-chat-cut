import type { NarrationTimingSnapshotV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';

export type ProductionSubtitleSourceV1 =
  | { type: 'narration-timing'; timingSnapshot: NarrationTimingSnapshotV1 }
  | { type: 'project-caption-track'; trackId: string; expectedCaptionsHash: string }
  | { type: 'none' };

export type ProductionSubtitlePolicyV1 = {
  includeSrt: boolean;
  includeVtt: boolean;
  source: ProductionSubtitleSourceV1;
  timeOrigin?: 'render-range';
  requireCaptionTrackMatch?: boolean;
};

export type ResolvedProductionSubtitlePolicyV1 = {
  includeSrt: boolean;
  includeVtt: boolean;
  source: ProductionSubtitleSourceV1;
  timeOrigin: 'render-range';
  requireCaptionTrackMatch: boolean;
  sourceHash: string;
  cueCount?: number;
};

export const DEFAULT_PRODUCTION_SUBTITLE_POLICY: ProductionSubtitlePolicyV1 = {
  includeSrt: true,
  includeVtt: true,
  source: { type: 'none' },
  timeOrigin: 'render-range',
  requireCaptionTrackMatch: true,
};
