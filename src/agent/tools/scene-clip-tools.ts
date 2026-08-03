import type { AgentContext } from '../context';
import { defaultTrackId, resolveTrackId, trackKind, type TrackId } from '../../editor/types';
import { SceneClipError } from '../../../packages/project-scene-bindings/src/contracts/scene-clip-errors.ts';
import type { SceneClipBindingV1 } from '../../../packages/project-scene-bindings/src/contracts/scene-clip-binding.ts';
import { validateSceneClipBinding } from '../../../packages/project-scene-bindings/src/schema/scene-clip-binding-validator.ts';
import { isBetterChatCutSceneClip } from '../../../packages/project-scene-bindings/src/schema/scene-clip-props-validator.ts';
import { compareSceneClipWithBinding } from '../../../packages/project-scene-bindings/src/timeline/scene-clip-sync.ts';
import { inspectSceneClip, listSceneClips } from '../../../packages/project-scene-bindings/src/timeline/scene-clip-inspection.ts';
import { planSceneClipBind } from '../../../packages/project-scene-bindings/src/timeline/scene-clip-actions.ts';
import { planSceneClipSync } from '../../../packages/project-scene-bindings/src/timeline/scene-clip-sync-plan.ts';
import { computeSceneClipItemFingerprint } from '../../../packages/project-scene-bindings/src/timeline/scene-clip-fingerprint.ts';


type Args = Record<string, unknown>;

function findItem(ctx: AgentContext, itemId: unknown) {
  const id = String(itemId ?? '');
  return ctx.getState().items.find((item) => item.id === id || item.id.startsWith(id)) ?? null;
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function asBinding(value: unknown): SceneClipBindingV1 {
  const validated = validateSceneClipBinding(value);
  if (!validated.valid || !validated.binding) {
    throw new SceneClipError('SCENE_BINDING_SCENE_INVALID', 'Invalid SceneClipBindingV1 payload', {
      diagnostics: validated.errors,
      recovery: 'Generate binding with scene_draft_get_binding_payload',
    });
  }
  return validated.binding;
}

function trackEnd(ctx: AgentContext, track: TrackId): number {
  let end = 0;
  for (const item of ctx.getState().items) {
    if (item.track !== track) continue;
    end = Math.max(end, item.startFrame + item.durationInFrames);
  }
  return end;
}

export async function execSceneClipTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  try {
    if (name === 'scene_clip_list') {
      const doc = ctx.getDoc();
      const result = listSceneClips({
        timelines: doc.timelines.map((tl) => ({
          id: tl.id,
          name: tl.name,
          items: tl.items,
        })),
        timelineId: typeof args.timelineId === 'string' ? args.timelineId : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        offset: typeof args.offset === 'number' ? args.offset : undefined,
      });
      return { ok: true, ...result };
    }

    if (name === 'scene_clip_get') {
      const item = findItem(ctx, args.itemId);
      if (!item) {
        throw new SceneClipError('SCENE_CLIP_NOT_FOUND', `No item ${String(args.itemId)}`, {
          recovery: 'Call scene_clip_list or read_timeline',
        });
      }
      const includeEmbeddedScene = args.includeEmbeddedScene !== false;
      const inspected = inspectSceneClip(item);
      const readiness = {
        ready: inspected.errors.length === 0,
        errors: inspected.errors,
        warnings: inspected.warnings,
      };
      const doc = ctx.getDoc();
      const timeline = doc.timelines.find((tl) => tl.id === doc.activeTimelineId) ?? doc.timelines[0];
      return {
        ok: true,
        itemId: item.id,
        timelineId: timeline?.id,
        timelineName: timeline?.name,
        trackId: item.track,
        startFrame: item.startFrame,
        durationInFrames: item.durationInFrames,
        srcInFrame: item.srcInFrame,
        name: item.name,
        width: item.width,
        height: item.height,
        itemFingerprint: inspected.itemFingerprint,
        binding: includeEmbeddedScene
          ? inspected.binding
          : inspected.binding
            ? {
              ...inspected.binding,
              scene: {
                schemaVersion: inspected.binding.scene.schemaVersion,
                id: inspected.binding.scene.id,
                name: inspected.binding.scene.name,
                fps: inspected.binding.scene.fps,
                durationInFrames: inspected.binding.scene.durationInFrames,
                canvas: inspected.binding.scene.canvas,
                theme: inspected.binding.scene.theme,
                nodes: [],
              },
            }
            : undefined,
        readiness,
        transform: inspected.transform,
        effects: inspected.effects,
        filters: inspected.filters,
        fadeInFrames: inspected.fadeInFrames,
        fadeOutFrames: inspected.fadeOutFrames,
        zoom: inspected.zoom,
        keyframes: inspected.keyframes,
        errors: inspected.errors,
        warnings: inspected.warnings,
      };
    }

    if (name === 'scene_clip_compare') {
      const item = findItem(ctx, args.itemId);
      if (!item) {
        throw new SceneClipError('SCENE_CLIP_NOT_FOUND', `No item ${String(args.itemId)}`, {
          recovery: 'Call scene_clip_list',
        });
      }
      const currentDraftBinding = args.currentDraftBinding === undefined
        ? undefined
        : asBinding(args.currentDraftBinding);
      return { ok: true, ...compareSceneClipWithBinding({ item, currentDraftBinding }) };
    }

    if (name === 'scene_clip_validate') {
      const item = findItem(ctx, args.itemId);
      if (!item) {
        throw new SceneClipError('SCENE_CLIP_NOT_FOUND', `No item ${String(args.itemId)}`, {
          recovery: 'Call scene_clip_list',
        });
      }
      const inspected = inspectSceneClip(item);
      const readiness = {
        ready: inspected.errors.length === 0,
        errors: inspected.errors,
        warnings: inspected.warnings,
      };
      return {
        ok: true,
        valid: inspected.errors.length === 0,
        ready: readiness.ready,
        itemFingerprint: inspected.itemFingerprint,
        bindingPayloadHash: inspected.binding?.bindingPayloadHash,
        sceneContentHash: inspected.binding?.sceneContentHash,
        dependencyFingerprint: inspected.binding?.dependencyFingerprint,
        errors: [...inspected.errors, ...readiness.errors],
        warnings: [...inspected.warnings, ...readiness.warnings],
      };
    }

    if (name === 'scene_clip_bind') {
      const binding = asBinding(args.binding);
      const state = ctx.getState();
      const doc = ctx.getDoc();
      let trackId = resolveTrackId(state, args.track ?? 'V1', 'video') ?? defaultTrackId(state, 'video');
      let needsCreateTrack = false;
      let createTrackId: string | undefined;
      if (!trackId) {
        needsCreateTrack = true;
        createTrackId = uid('track');
        trackId = createTrackId;
      } else if (trackKind(state, trackId) !== 'video') {
        throw new SceneClipError('SCENE_CLIP_TRACK_NOT_VIDEO', `Track ${trackId} is not a video track`, {
          recovery: 'Pass a video track id/alias',
        });
      }

      const resolvedStartFrame = typeof args.startFrame === 'number'
        ? args.startFrame
        : trackEnd(ctx, trackId);

      const plan = planSceneClipBind({
        bind: {
          requestId: String(args.requestId ?? ''),
          binding,
          track: typeof args.track === 'string' ? args.track : undefined,
          startFrame: typeof args.startFrame === 'number' ? args.startFrame : undefined,
          ripple: args.ripple === true,
          name: typeof args.name === 'string' ? args.name : undefined,
        },
        itemId: uid('item'),
        trackId,
        createTrackId,
        needsCreateTrack,
        projectFps: state.fps,
        resolvedStartFrame,
        existingItems: state.items,
      });

      if (plan.replayed) {
        return {
          ok: true,
          itemId: plan.item.id,
          replayed: true,
          timelineId: doc.activeTimelineId,
          trackId: plan.item.track,
          startFrame: plan.item.startFrame,
          durationInFrames: plan.item.durationInFrames,
          itemFingerprint: computeSceneClipItemFingerprint(plan.item),
          bindingPayloadHash: binding.bindingPayloadHash,
          actionSummary: 'Replayed identical scene_clip_bind request',
          warnings: plan.warnings,
        };
      }

      const atomic = plan.actions.map((action) => {
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
      ctx.commands.batch(atomic as never, 'Add Better Chat Cut scene clip');

      const after = findItem(ctx, plan.item.id) ?? plan.item;
      return {
        ok: true,
        itemId: after.id,
        replayed: false,
        timelineId: doc.activeTimelineId,
        trackId: after.track,
        startFrame: after.startFrame,
        durationInFrames: after.durationInFrames,
        itemFingerprint: computeSceneClipItemFingerprint(after),
        bindingPayloadHash: binding.bindingPayloadHash,
        actionSummary: `Add "${after.name}" at frame ${after.startFrame}, duration ${after.durationInFrames}`,
        warnings: plan.warnings,
      };
    }

    if (name === 'scene_clip_sync') {
      const item = findItem(ctx, args.itemId);
      if (!item) {
        throw new SceneClipError('SCENE_CLIP_NOT_FOUND', `No item ${String(args.itemId)}`, {
          recovery: 'Call scene_clip_get',
        });
      }
      if (!isBetterChatCutSceneClip(item)) {
        throw new SceneClipError('SCENE_CLIP_WRONG_TEMPLATE_ID', 'Item is not a Better Chat Cut scene clip', {
          details: { itemId: item.id },
          recovery: 'Pass a scene clip item id from scene_clip_list',
        });
      }
      const binding = asBinding(args.binding);
      const plan = planSceneClipSync(item, {
        requestId: String(args.requestId ?? ''),
        itemId: item.id,
        expectedItemFingerprint: String(args.expectedItemFingerprint ?? ''),
        expectedBindingPayloadHash: String(args.expectedBindingPayloadHash ?? ''),
        binding,
        timingPolicy: args.timingPolicy === 'match-scene' ? 'match-scene' : 'preserve-timeline',
        namePolicy: args.namePolicy === 'match-draft' ? 'match-draft' : 'preserve',
      }, ctx.getState().fps);

      if (!plan.changed) {
        return {
          ok: true,
          itemId: item.id,
          previousBindingPayloadHash: plan.previousBinding.bindingPayloadHash,
          resultingBindingPayloadHash: plan.previousBinding.bindingPayloadHash,
          previousSceneContentHash: plan.previousBinding.sceneContentHash,
          resultingSceneContentHash: plan.previousBinding.sceneContentHash,
          previousDurationInFrames: item.durationInFrames,
          resultingDurationInFrames: item.durationInFrames,
          resultingItemFingerprint: computeSceneClipItemFingerprint(item),
          changed: false,
          changeSummary: plan.changeSummary,
          warnings: plan.warnings,
        };
      }

      ctx.commands.batch(plan.actions as never, 'Sync Better Chat Cut scene clip');
      const after = findItem(ctx, item.id)!;
      return {
        ok: true,
        itemId: after.id,
        previousBindingPayloadHash: plan.previousBinding.bindingPayloadHash,
        resultingBindingPayloadHash: plan.resultingBinding.bindingPayloadHash,
        previousSceneContentHash: plan.previousBinding.sceneContentHash,
        resultingSceneContentHash: plan.resultingBinding.sceneContentHash,
        previousDurationInFrames: item.durationInFrames,
        resultingDurationInFrames: after.durationInFrames,
        resultingItemFingerprint: computeSceneClipItemFingerprint(after),
        changed: true,
        changeSummary: plan.changeSummary,
        warnings: plan.warnings,
      };
    }

    return { error: `unknown tool ${name}` };
  } catch (error) {
    if (error instanceof SceneClipError) {
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
