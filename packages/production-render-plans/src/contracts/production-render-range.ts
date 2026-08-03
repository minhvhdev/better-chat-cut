export type ProductionRenderRangeV1 =
  | { mode: 'full-timeline' }
  | { mode: 'video-plan-assembly'; planId: string; planHash: string }
  | { mode: 'frames'; startFrame: number; endFrame: number };

export type ResolvedProductionRenderRangeV1 = {
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
  mode: ProductionRenderRangeV1['mode'];
  planId?: string;
  planHash?: string;
};
