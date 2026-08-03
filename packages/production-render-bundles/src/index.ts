export * from './contracts/index.ts';
export * from './storage/index.ts';
export * from './qa/index.ts';
export * from './rendering/index.ts';

import { createProductionRenderService } from './rendering/production-render-service.ts';
import { createDeliveryStore } from './storage/operation-store.ts';
import { createFakeTimelineRenderAdapter, createRemotionTimelineRenderAdapter } from './rendering/timeline-render-adapter.ts';

export function createProductionRenderBundleService(options?: Parameters<typeof createProductionRenderService>[0]) {
  return createProductionRenderService(options);
}

export {
  createProductionRenderService,
  createDeliveryStore,
  createFakeTimelineRenderAdapter,
  createRemotionTimelineRenderAdapter,
};
