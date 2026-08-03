import type { ProductionRenderPlanV1 } from '../../../production-render-plans/src/contracts/production-render-plan.ts';
import type { ProductionProjectLike } from '../../../production-render-plans/src/preparation/prepare-production-render.ts';

export type ProductionTimelineRenderInput = {
  plan: ProductionRenderPlanV1;
  projectSnapshot: ProductionProjectLike;
  outputLocation: string;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export type ProductionTimelineRenderResult = {
  outputLocation: string;
  encoder?: string;
};

export interface ProductionTimelineRenderAdapter {
  render(input: ProductionTimelineRenderInput): Promise<ProductionTimelineRenderResult>;
}

type RemotionRenderTimeline = (args: {
  state: unknown;
  project?: unknown;
  timelineId?: string;
  outputLocation: string;
  codec?: string;
  frameRange?: [number, number];
  scale?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}) => Promise<{ outputLocation: string; encoder?: string }>;

async function loadRenderTimeline(): Promise<RemotionRenderTimeline> {
  // Shared OpenChatCut Remotion pipeline (untyped .mjs). No second renderer.
  // @ts-expect-error remotion/render.mjs ships without TypeScript declarations
  const mod = await import('../../../../remotion/render.mjs') as { renderTimeline: RemotionRenderTimeline };
  return mod.renderTimeline;
}

/** Adapter wrapping remotion/render.mjs renderTimeline — no second renderer. */
export function createRemotionTimelineRenderAdapter(): ProductionTimelineRenderAdapter {
  return {
    async render(input) {
      const renderTimeline = await loadRenderTimeline();
      const timeline = input.projectSnapshot.timelines.find((t) => t.id === input.plan.source.timelineId)
        ?? input.projectSnapshot.timelines[0];
      if (!timeline) throw new Error('timeline missing from snapshot');
      const state = {
        fps: timeline.fps,
        width: timeline.width,
        height: timeline.height,
        fit: timeline.fit,
        items: timeline.items,
        transitions: timeline.transitions,
        markers: timeline.markers,
        tracks: timeline.tracks,
        captions: timeline.captions,
        selectedId: null,
        assets: input.projectSnapshot.assets,
      };
      const scale = input.plan.profile.width / Math.max(1, timeline.width);
      const result = await renderTimeline({
        state,
        project: input.projectSnapshot,
        timelineId: input.plan.source.timelineId,
        outputLocation: input.outputLocation,
        codec: 'h264',
        frameRange: [input.plan.source.range.startFrame, input.plan.source.range.endFrame - 1] as [number, number],
        scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        signal: input.signal,
        onProgress: input.onProgress,
      });
      return { outputLocation: result.outputLocation, encoder: result.encoder };
    },
  };
}

export type FakeRenderAdapterOptions = {
  writeBytes?: Buffer;
  fail?: boolean;
  onRender?: (input: ProductionTimelineRenderInput) => void;
};

export function createFakeTimelineRenderAdapter(options: FakeRenderAdapterOptions = {}): ProductionTimelineRenderAdapter {
  return {
    async render(input) {
      options.onRender?.(input);
      if (options.fail) throw new Error('fake render failed');
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      mkdirSync(dirname(input.outputLocation), { recursive: true });
      writeFileSync(input.outputLocation, options.writeBytes ?? Buffer.from('ftypisomfake-mp4-fixture'));
      input.onProgress?.(1);
      return { outputLocation: input.outputLocation, encoder: 'fake' };
    },
  };
}
