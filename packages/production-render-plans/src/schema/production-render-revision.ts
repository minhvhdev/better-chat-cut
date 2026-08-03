import { PRODUCTION_RENDER_REVISION } from '../contracts/production-render-policy.ts';

export function computeProductionRenderRevision(): string {
  return PRODUCTION_RENDER_REVISION;
}
