import type { AgentContext } from '../context';
import { activeTimeline } from '../../editor/types';
import {
  previewVideoPlanAssembly,
  planVideoPlanAssembly,
} from '../../../packages/project-video-assembly/src/planning/project-assembly-planner.ts';
import { inspectVideoPlanAssembly } from '../../../packages/project-video-assembly/src/inspection/assembly-inspector.ts';
import { createVideoPlanRenderValidator } from '../../../packages/project-video-assembly/src/rendering/assembly-render-validator.ts';
import { VideoPlanError } from '../../../packages/video-plans/src/contracts/video-plan-errors.ts';
import type { AssemblyTimelineLike } from '../../../packages/project-video-assembly/src/planning/track-resolver.ts';

type Args = Record<string, unknown>;

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function timelineLike(ctx: AgentContext): AssemblyTimelineLike {
  const doc = ctx.getDoc();
  const timeline = activeTimeline(doc);
  return {
    id: timeline.id,
    name: timeline.name,
    width: timeline.width,
    height: timeline.height,
    fps: timeline.fps,
    fit: timeline.fit,
    items: timeline.items,
    transitions: timeline.transitions,
    markers: timeline.markers,
    tracks: timeline.tracks as AssemblyTimelineLike['tracks'],
  };
}

export async function execVideoPlanTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  try {
    if (name === 'video_plan_preview_assembly') {
      return { ok: true, ...previewVideoPlanAssembly({ plan: args.plan, timeline: timelineLike(ctx) }) };
    }

    if (name === 'video_plan_assemble') {
      const planned = planVideoPlanAssembly({
        plan: args.plan,
        timeline: timelineLike(ctx),
        requestId: String(args.requestId ?? ''),
        uid,
      });
      if (!planned.result.replayed) {
        // Convert setTransition-after-addTransition into batch actions the reducer accepts.
        const atomic = planned.actions.map((action) => {
          if (action.type === 'add') {
            return {
              type: 'add' as const,
              item: action.item as never,
              startFrame: action.startFrame,
              ripple: action.ripple,
            };
          }
          return action;
        });
        ctx.commands.batch(atomic as never, planned.result.actionSummary);
      }
      return { ok: true, ...planned.result };
    }

    if (name === 'video_plan_inspect_assembly') {
      return { ok: true, ...inspectVideoPlanAssembly({ plan: args.plan, timeline: timelineLike(ctx) }) };
    }

    if (name === 'video_plan_validate_render') {
      const validator = createVideoPlanRenderValidator();
      let contactSheetPng: Uint8Array | undefined;
      const report = await validator.validate({
        plan: args.plan,
        timeline: timelineLike(ctx),
        mode: args.mode === 'metadata-only' ? 'metadata-only' : 'sample-frames',
        columns: typeof args.columns === 'number' ? args.columns : undefined,
        includeTransitionSamples: args.includeTransitionSamples !== false,
        onContactSheet: (png) => { contactSheetPng = png; },
      });
      return {
        ok: true,
        ...report,
        ...(contactSheetPng ? { contactSheetPngBase64: Buffer.from(contactSheetPng).toString('base64') } : {}),
      };
    }

    return { error: `unknown tool ${name}` };
  } catch (error) {
    if (error instanceof VideoPlanError) {
      return {
        error: `${error.code}: ${error.message}`,
        code: error.code,
        diagnostics: error.diagnostics,
        recovery: error.recovery,
        details: error.details,
      };
    }
    throw error;
  }
}
