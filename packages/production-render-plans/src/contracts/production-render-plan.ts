import type { ResolvedProductionRenderProfileV1 } from './production-render-profile.ts';
import type { ResolvedProductionSubtitlePolicyV1 } from './production-subtitle-policy.ts';
import type { ProductionQaPolicyV1 } from './production-qa-policy.ts';
import type { ProductionDeliveryPolicyV1 } from './production-delivery-policy.ts';

export type ProductionRenderPlanV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  description?: string;
  requestHash: string;
  planHash: string;
  productionRenderRevision: string;
  source: {
    projectId: string;
    projectFingerprint: string;
    timelineId: string;
    timelineFingerprint: string;
    range: {
      startFrame: number;
      endFrame: number;
      durationInFrames: number;
    };
    timeline: {
      width: number;
      height: number;
      fps: number;
    };
    videoPlan?: {
      planId: string;
      planHash: string;
      assemblyId: string;
      status: 'complete';
    };
    narration?: {
      narrationPlanId: string;
      narrationPlanHash: string;
      timingHash: string;
      status: 'complete';
    };
  };
  profile: ResolvedProductionRenderProfileV1;
  subtitles: ResolvedProductionSubtitlePolicyV1;
  qa: ProductionQaPolicyV1;
  delivery: ProductionDeliveryPolicyV1;
  bundleId: string;
  preparedAt: string;
};

export type ProductionRenderPlanWithoutHash = Omit<ProductionRenderPlanV1, 'planHash' | 'preparedAt'>;
