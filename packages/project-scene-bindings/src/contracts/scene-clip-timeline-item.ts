/** Minimal timeline item shape needed by project-scene-bindings (matches OpenChatCut TimelineItem fields). */
export type SceneClipTimelineItemLike = {
  id: string;
  track: string;
  startFrame: number;
  durationInFrames: number;
  name: string;
  kind: string;
  templateId?: string;
  props?: Record<string, unknown>;
  width?: number;
  height?: number;
  srcInFrame?: number;
  transform?: unknown;
  keyframes?: unknown;
  filters?: unknown;
  effects?: unknown;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  zoom?: unknown;
};
