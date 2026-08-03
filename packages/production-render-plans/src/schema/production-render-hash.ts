import { sha256Hex, stableStringify } from './production-render-serialization.ts';
import type { ProductionRenderRequestV1 } from '../contracts/production-render-request.ts';
import type { ProductionRenderPlanWithoutHash, ProductionRenderPlanV1 } from '../contracts/production-render-plan.ts';
import { PRODUCTION_RENDER_REVISION } from '../contracts/production-render-policy.ts';

export function computeProductionRenderRequestHash(request: ProductionRenderRequestV1): string {
  return sha256Hex(stableStringify(request));
}

export function computeProductionRenderPlanHash(planWithoutHash: ProductionRenderPlanWithoutHash): string {
  return sha256Hex(stableStringify(planWithoutHash));
}

export function computeProductionRenderRevision(): string {
  return PRODUCTION_RENDER_REVISION;
}

export function computeBundleId(requestId: string, planHash: string): string {
  const tail = requestId.includes('.') ? requestId.slice(requestId.indexOf('.') + 1) : requestId;
  const short = planHash.slice(0, 8);
  return `delivery.${tail}.${short}`;
}

/** Render-relevant project fingerprint (excludes UI selection/playhead). */
export function computeProductionProjectFingerprint(project: unknown): string {
  const doc = asRecord(project);
  if (!doc) return sha256Hex('null');
  const timelines = Array.isArray(doc.timelines) ? doc.timelines.map(stripTimelineUi) : [];
  const payload = {
    version: doc.version,
    assets: sanitizeAssets(doc.assets),
    mediaFolders: doc.mediaFolders,
    timelines,
    activeTimelineId: doc.activeTimelineId,
    designStyle: doc.designStyle,
  };
  return sha256Hex(stableStringify(payload));
}

export function computeProductionTimelineFingerprint(timeline: unknown): string {
  return sha256Hex(stableStringify(stripTimelineUi(timeline)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sanitizeAssets(assets: unknown): unknown {
  if (!Array.isArray(assets)) return [];
  return assets.map((asset) => {
    const a = asRecord(asset);
    if (!a) return asset;
    const { favorite: _f, folderId: _folder, ...rest } = a;
    return rest;
  });
}

function stripTimelineUi(timeline: unknown): unknown {
  const t = asRecord(timeline);
  if (!t) return timeline;
  const {
    selectedId: _s,
    selectedIds: _ss,
    playhead: _p,
    zoom: _z,
    scrollLeft: _sl,
    scrollTop: _st,
    hoverId: _h,
    inspectorOpen: _i,
    assets: _a,
    ...rest
  } = t;
  return rest;
}

export function planWithoutPreparedAt(plan: ProductionRenderPlanV1): ProductionRenderPlanWithoutHash {
  const { planHash: _ph, preparedAt: _pa, bundleId: _bid, ...rest } = plan;
  return { ...rest, bundleId: '' };
}
