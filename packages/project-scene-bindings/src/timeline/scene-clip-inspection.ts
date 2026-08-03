import type { SceneClipBindingV1 } from '../contracts/scene-clip-binding.ts';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import type { SceneClipDiagnostic } from '../contracts/scene-clip-errors.ts';
import type { SceneClipSummary } from '../contracts/scene-clip-status.ts';
import { parseSceneClipBinding, isBetterChatCutSceneClip } from '../schema/scene-clip-props-validator.ts';
import { computeSceneClipItemFingerprint } from './scene-clip-fingerprint.ts';

export function summarizeSceneClip(input: {
  item: SceneClipTimelineItemLike;
  timelineId: string;
  timelineName: string;
}): SceneClipSummary {
  const { item, timelineId, timelineName } = input;
  const parsed = parseSceneClipBinding(item);
  const fingerprint = computeSceneClipItemFingerprint(item);
  return {
    itemId: item.id,
    timelineId,
    timelineName,
    trackId: item.track,
    startFrame: item.startFrame,
    durationInFrames: item.durationInFrames,
    ...(item.srcInFrame !== undefined ? { srcInFrame: item.srcInFrame } : {}),
    name: item.name,
    itemFingerprint: fingerprint,
    bindingValid: Boolean(parsed.binding),
    ...(parsed.binding ? {
      bindingPayloadHash: parsed.binding.bindingPayloadHash,
      sourceDraft: parsed.binding.sourceDraft,
      embeddedScene: {
        id: parsed.binding.scene.id,
        name: parsed.binding.scene.name,
        fps: parsed.binding.scene.fps,
        durationInFrames: parsed.binding.scene.durationInFrames,
        nodeCount: parsed.binding.scene.nodes.length,
      },
    } : {}),
    errors: parsed.errors,
    warnings: parsed.warnings,
  };
}

export function listSceneClips(input: {
  timelines: Array<{ id: string; name: string; items: SceneClipTimelineItemLike[] }>;
  timelineId?: string;
  limit?: number;
  offset?: number;
}): { total: number; offset: number; limit: number; items: SceneClipSummary[] } {
  const limit = Math.min(200, Math.max(1, Math.round(input.limit ?? 50)));
  const offset = Math.max(0, Math.round(input.offset ?? 0));
  const timelines = input.timelineId
    ? input.timelines.filter((tl) => tl.id === input.timelineId)
    : input.timelines;
  const all = timelines.flatMap((tl) =>
    tl.items
      .filter((item) => isBetterChatCutSceneClip(item))
      .map((item) => summarizeSceneClip({ item, timelineId: tl.id, timelineName: tl.name })));
  return {
    total: all.length,
    offset,
    limit,
    items: all.slice(offset, offset + limit),
  };
}

export function inspectSceneClip(item: SceneClipTimelineItemLike): {
  binding?: SceneClipBindingV1;
  itemFingerprint: string;
  errors: SceneClipDiagnostic[];
  warnings: SceneClipDiagnostic[];
  transform?: unknown;
  effects?: unknown;
  filters?: unknown;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  zoom?: unknown;
  keyframes?: unknown;
} {
  const parsed = parseSceneClipBinding(item);
  return {
    binding: parsed.binding,
    itemFingerprint: computeSceneClipItemFingerprint(item),
    errors: parsed.errors,
    warnings: parsed.warnings,
    transform: item.transform,
    effects: item.effects,
    filters: item.filters,
    fadeInFrames: item.fadeInFrames,
    fadeOutFrames: item.fadeOutFrames,
    zoom: item.zoom,
    keyframes: item.keyframes,
  };
}
