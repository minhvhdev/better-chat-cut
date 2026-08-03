import type { ProductionRenderRangeV1 } from './production-render-range.ts';
import type { ProductionRenderProfileV1 } from './production-render-profile.ts';
import type { ProductionSubtitlePolicyV1 } from './production-subtitle-policy.ts';
import type { ProductionQaPolicyV1 } from './production-qa-policy.ts';
import type { ProductionDeliveryPolicyV1 } from './production-delivery-policy.ts';

export type ProductionRenderRequestV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  description?: string;
  source: {
    timelineId?: string;
    range: ProductionRenderRangeV1;
  };
  profile: ProductionRenderProfileV1;
  subtitles?: ProductionSubtitlePolicyV1;
  qa?: Partial<ProductionQaPolicyV1>;
  delivery?: Partial<ProductionDeliveryPolicyV1>;
};

export const PRODUCTION_RENDER_REQUEST_ID_REGEX = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const MAX_PRODUCTION_RENDER_REQUEST_BYTES = 2 * 1024 * 1024;
