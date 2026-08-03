import type { TimelineState } from '../../../../src/editor/types.ts';
import { validateVideoPlan } from '../../../video-plans/src/schema/video-plan-validator.ts';
import { videoPlanDiagnostic, type VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';
import type {
  ValidateVideoPlanRenderInput,
  VideoPlanRenderValidationReportV1,
} from '../contracts/render-validation.ts';
import { inspectVideoPlanAssembly } from '../inspection/assembly-inspector.ts';
import { discoverVideoPlanClips } from '../inspection/assembly-discovery.ts';
import { readVideoPlanClipMetadata } from '../planning/idempotency.ts';
import { previewVideoPlanAssembly } from '../planning/project-assembly-planner.ts';
import type { AssemblyTimelineLike } from '../planning/track-resolver.ts';
import { selectAssemblySampleFrames } from './assembly-frame-sampler.ts';
import { evaluateAssemblyReadiness } from './assembly-readiness.ts';

export type AssemblyRenderHooks = {
  shouldSkip?: () => boolean;
  renderStill?: (input: {
    state: TimelineState;
    frame: number;
    scale?: number;
  }) => Promise<{
    png: Buffer;
    width: number;
    height: number;
    pixelHash: string;
    fullyTransparent: boolean;
    mostlyBlack: boolean;
  }>;
  renderContactSheet?: (input: {
    state: TimelineState;
    frames: number[];
    columns: number;
  }) => Promise<{
    png: Buffer;
    width: number;
    height: number;
    frames: number[];
    columns: number;
  }>;
};

function toTimelineState(timeline: AssemblyTimelineLike): TimelineState {
  return {
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    fit: timeline.fit,
    items: timeline.items as TimelineState['items'],
    transitions: (timeline.transitions ?? []) as TimelineState['transitions'],
    markers: (timeline.markers ?? []) as TimelineState['markers'],
    tracks: timeline.tracks as TimelineState['tracks'],
    selectedId: null,
    selectedIds: [],
  };
}

function resolvedAssemblyWindow(input: {
  timeline: AssemblyTimelineLike;
  planId: string;
  planHash: string;
  scheduleTotalDuration: number;
  previewStart: number;
  previewTotal: number;
}): { absoluteStartFrame: number; totalDurationInFrames: number } {
  const clips = discoverVideoPlanClips(input.timeline, input.planId, input.planHash);
  if (!clips.length) {
    return {
      absoluteStartFrame: input.previewStart,
      totalDurationInFrames: input.previewTotal,
    };
  }
  const ordered = clips
    .map((clip) => ({ clip, meta: readVideoPlanClipMetadata(clip)! }))
    .sort((a, b) => a.meta.sequenceIndex - b.meta.sequenceIndex);
  const first = ordered[0]!.clip;
  const last = ordered[ordered.length - 1]!.clip;
  const trailingGap = Math.max(
    0,
    input.scheduleTotalDuration - (last.startFrame + last.durationInFrames - first.startFrame),
  );
  return {
    absoluteStartFrame: first.startFrame,
    totalDurationInFrames: (last.startFrame + last.durationInFrames + trailingGap) - first.startFrame,
  };
}

export interface VideoPlanRenderValidator {
  validate(input: ValidateVideoPlanRenderInput): Promise<VideoPlanRenderValidationReportV1>;
}

export function createVideoPlanRenderValidator(hooks: AssemblyRenderHooks = {}): VideoPlanRenderValidator {
  return {
    async validate(input) {
      const mode = input.mode ?? 'sample-frames';
      const columns = input.columns ?? 4;
      const includeTransitionSamples = input.includeTransitionSamples !== false;
      const validated = validateVideoPlan(input.plan, { includeSchedule: true });
      const errors: VideoPlanDiagnostic[] = [...validated.errors];
      const warnings: VideoPlanDiagnostic[] = [...validated.warnings];
      const timeline = input.timeline;
      const planId = validated.normalizedPlan?.id ?? 'invalid';
      const planHash = validated.planHash ?? '';

      const inspection = inspectVideoPlanAssembly({ plan: input.plan, timeline });
      if (inspection.status === 'not-assembled') {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_RENDER_NOT_READY', 'Assembly is not present on the timeline/proposal draft', {
          planId,
          recovery: 'Assemble the VideoPlan before render validation',
        }));
      } else {
        errors.push(...inspection.errors.filter((e) => e.code !== 'VIDEO_PLAN_ASSEMBLY_NOT_FOUND'));
      }

      const preview = validated.valid
        ? previewVideoPlanAssembly({ plan: input.plan, timeline })
        : null;
      const window = validated.valid && validated.schedule && validated.planHash
        ? resolvedAssemblyWindow({
          timeline,
          planId,
          planHash: validated.planHash,
          scheduleTotalDuration: validated.schedule.totalDurationInFrames,
          previewStart: preview?.absoluteStartFrame ?? 0,
          previewTotal: preview?.totalDurationInFrames ?? validated.schedule.totalDurationInFrames,
        })
        : { absoluteStartFrame: 0, totalDurationInFrames: 0 };

      const readiness = validated.valid && validated.planHash
        ? await evaluateAssemblyReadiness({
          timeline,
          planId,
          planHash: validated.planHash,
        })
        : {
          planRangeReady: false,
          timelineExportReady: false,
          sceneClipsReady: 0,
          sceneClipsNotReady: 0,
        };

      if (!readiness.planRangeReady) {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_EXPORT_READINESS_FAILED', 'One or more assembled scene clips are not export-ready', {
          planId,
          recovery: 'Fix scene binding/runtime dependencies',
        }));
      }

      const report: VideoPlanRenderValidationReportV1 = {
        valid: false,
        ready: false,
        planId,
        planHash,
        timelineId: timeline.id,
        targetTrackId: preview?.targetTrackId,
        assemblyStatus: inspection.status,
        absoluteStartFrame: window.absoluteStartFrame,
        absoluteEndFrame: window.absoluteStartFrame + window.totalDurationInFrames,
        totalDurationInFrames: window.totalDurationInFrames,
        timeline: {
          width: timeline.width,
          height: timeline.height,
          fps: timeline.fps,
        },
        readiness,
        renderedSamples: [],
        transitionChecks: (validated.schedule?.transitions ?? []).map((tr) => ({
          outgoingEntryId: tr.outgoingEntryId,
          incomingEntryId: tr.incomingEntryId,
          type: tr.type,
          durationInFrames: tr.durationInFrames,
          renderable: inspection.status === 'complete' || inspection.status === 'drifted',
          visuallyChanges: tr.type !== 'cut',
          errors: [],
          warnings: [],
        })),
        errors,
        warnings,
      };

      if (mode === 'metadata-only' || !validated.valid || !validated.schedule || !preview) {
        report.valid = errors.filter((e) => e.severity === 'error').length === 0;
        report.ready = report.valid && readiness.timelineExportReady;
        return report;
      }

      const samples = selectAssemblySampleFrames({
        absoluteStartFrame: window.absoluteStartFrame,
        totalDurationInFrames: window.totalDurationInFrames,
        schedule: validated.schedule,
        includeTransitionSamples,
      });
      if (samples.truncated) {
        warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_RENDER_SAMPLE_FAILED', 'Sample frame set truncated to max limit', {
          planId,
          recovery: 'Reduce scenes/transitions or raise sampling budget in a future revision',
        }));
      }

      const skip = hooks.shouldSkip?.() === true || !hooks.renderStill || !hooks.renderContactSheet;
      if (skip) {
        report.renderedSamples = samples.frames.map((sample) => ({
          frame: sample.frame,
          reasons: sample.reasons,
          rendered: false,
          errors: [],
          warnings: [videoPlanDiagnostic('warning', 'VIDEO_PLAN_RENDER_SAMPLE_FAILED', 'Timeline still renderer unavailable in this runtime; metadata validation completed', {
            frame: sample.frame,
            recovery: 'Run verify:better-chat-cut-video-assembly:render for Remotion stills/contact sheet',
          })],
        }));
        report.warnings = warnings;
        report.valid = errors.filter((e) => e.severity === 'error').length === 0;
        report.ready = report.valid && readiness.timelineExportReady;
        return report;
      }

      const state = toTimelineState(timeline);
      let previousHash: string | undefined;
      for (const sample of samples.frames) {
        try {
          const still = await hooks.renderStill!({ state, frame: sample.frame, scale: 0.25 });
          const sampleErrors: VideoPlanDiagnostic[] = [];
          const sampleWarnings: VideoPlanDiagnostic[] = [];
          if (still.fullyTransparent) {
            sampleErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_RENDER_SAMPLE_FAILED', 'Fully transparent frame in active plan range', {
              frame: sample.frame,
              recovery: 'Ensure scene clips cover the sampled frame',
            }));
          }
          if (still.mostlyBlack) {
            sampleWarnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_RENDER_SAMPLE_FAILED', 'Mostly black/small PNG for sampled frame', {
              frame: sample.frame,
            }));
          }
          if (previousHash && previousHash === still.pixelHash
            && sample.reasons.some((reason) => reason.includes('transition') || reason.includes('middle'))) {
            sampleWarnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_RENDER_SAMPLE_FAILED', 'Identical adjacent sampled frames', {
              frame: sample.frame,
            }));
          }
          previousHash = still.pixelHash;
          report.renderedSamples.push({
            frame: sample.frame,
            reasons: sample.reasons,
            rendered: true,
            width: still.width,
            height: still.height,
            byteLength: still.png.byteLength,
            pixelHash: still.pixelHash,
            fullyTransparent: still.fullyTransparent,
            mostlyBlack: still.mostlyBlack,
            errors: sampleErrors,
            warnings: sampleWarnings,
          });
          errors.push(...sampleErrors);
          warnings.push(...sampleWarnings);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const diagnostic = videoPlanDiagnostic('error', 'VIDEO_PLAN_RENDER_SAMPLE_FAILED', `Failed to render frame ${sample.frame}: ${message}`, {
            frame: sample.frame,
            recovery: 'Fix timeline/scene render errors and retry',
          });
          report.renderedSamples.push({
            frame: sample.frame,
            reasons: sample.reasons,
            rendered: false,
            errors: [diagnostic],
            warnings: [],
          });
          errors.push(diagnostic);
        }
      }

      try {
        const sheet = await hooks.renderContactSheet!({
          state,
          frames: samples.frames.map((sample) => sample.frame),
          columns,
        });
        report.contactSheet = {
          mimeType: 'image/png',
          byteLength: sheet.png.byteLength,
          frames: sheet.frames,
          columns: sheet.columns,
          width: sheet.width,
          height: sheet.height,
        };
        input.onContactSheet?.(sheet.png);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_RENDER_CONTACT_SHEET_FAILED', `Contact sheet failed: ${message}`, {
          planId,
          recovery: 'Fix timeline render errors and retry',
        }));
      }

      report.errors = errors;
      report.warnings = warnings;
      report.valid = errors.filter((e) => e.severity === 'error').length === 0;
      report.ready = report.valid && readiness.timelineExportReady;
      return report;
    },
  };
}
