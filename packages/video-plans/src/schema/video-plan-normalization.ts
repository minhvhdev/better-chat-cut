import { sceneDurationToTimelineFrames } from '../../../project-scene-bindings/src/timeline/scene-clip-item-builder.ts';
import { validateSceneClipBinding } from '../../../project-scene-bindings/src/schema/scene-clip-binding-validator.ts';
import type { VideoPlanV1, VideoPlanSceneEntryV1, VideoPlanTransitionV1 } from '../contracts/video-plan.ts';
import type { VideoPlanNormalizationResult } from '../contracts/video-plan-validation.ts';
import { videoPlanDiagnostic, type VideoPlanDiagnostic } from '../contracts/video-plan-errors.ts';
import {
  MARKER_COLORS,
  MAX_GAP_AFTER_FRAMES,
  MAX_MARKER_NOTE_LENGTH,
  MAX_TRANSITION_DURATION_FRAMES,
  MAX_VIDEO_PLAN_SCENES,
  MAX_VIDEO_PLAN_SERIALIZED_BYTES,
  OUTPUT_FPS_MAX,
  OUTPUT_FPS_MIN,
  OUTPUT_HEIGHT_MAX,
  OUTPUT_HEIGHT_MIN,
  OUTPUT_WIDTH_MAX,
  OUTPUT_WIDTH_MIN,
  VIDEO_PLAN_ID_PATTERN,
  VIDEO_PLAN_SCENE_ENTRY_ID_PATTERN,
  VIDEO_PLAN_SCHEMA_VERSION,
  VIDEO_PLAN_VISUAL_TRANSITION_TYPES,
  type VideoPlanMarkerColor,
  type VideoPlanVisualTransitionType,
} from '../contracts/video-plan-policy.ts';
import { VIDEO_PLAN_KNOWN_ROOT_KEYS, VIDEO_PLAN_SCENE_KNOWN_KEYS } from './video-plan-schema.ts';
import {
  deepCloneJson,
  isJsonSerializable,
  stableStringify,
  utf8ByteLength,
} from './video-plan-serialization.ts';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim();
}

function isMarkerColor(value: unknown): value is VideoPlanMarkerColor {
  return typeof value === 'string' && (MARKER_COLORS as readonly string[]).includes(value);
}

function isVisualTransitionType(value: unknown): value is VideoPlanVisualTransitionType {
  return typeof value === 'string' && (VIDEO_PLAN_VISUAL_TRANSITION_TYPES as readonly string[]).includes(value);
}

function normalizeTransition(
  raw: unknown,
  path: string,
  errors: VideoPlanDiagnostic[],
  sceneEntryId?: string,
): VideoPlanTransitionV1 | undefined {
  if (raw === undefined) return undefined;
  const record = asRecord(raw);
  if (!record) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_INVALID', 'transitionToNext must be an object', {
      path,
      sceneEntryId,
      recovery: 'Use { mode: "cut" } or a timeline-transition object',
    }));
    return undefined;
  }
  if (record.mode === 'cut') {
    return { mode: 'cut' };
  }
  if (record.mode === 'timeline-transition') {
    if (!isVisualTransitionType(record.type)) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_INVALID', 'Unsupported or missing transition type', {
        path: `${path}.type`,
        sceneEntryId,
        details: { type: record.type },
        recovery: 'Use a built-in visual transition type (not audio-cross-fade or custom-shader)',
      }));
      return undefined;
    }
    const duration = record.durationInFrames;
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_INVALID', 'durationInFrames must be a positive integer', {
        path: `${path}.durationInFrames`,
        sceneEntryId,
        recovery: 'Pass an integer durationInFrames > 0',
      }));
      return undefined;
    }
    if (duration > MAX_TRANSITION_DURATION_FRAMES) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_INVALID', `durationInFrames exceeds ${MAX_TRANSITION_DURATION_FRAMES}`, {
        path: `${path}.durationInFrames`,
        sceneEntryId,
        recovery: 'Reduce transition duration',
      }));
      return undefined;
    }
    const direction = record.direction;
    let normalizedDirection: 'left' | 'right' | 'up' | 'down' = 'left';
    if (direction !== undefined) {
      if (direction !== 'left' && direction !== 'right' && direction !== 'up' && direction !== 'down') {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_INVALID', 'Invalid transition direction', {
          path: `${path}.direction`,
          sceneEntryId,
          recovery: 'Use left, right, up, or down',
        }));
        return undefined;
      }
      normalizedDirection = direction;
    }
    return {
      mode: 'timeline-transition',
      type: record.type,
      durationInFrames: duration,
      direction: normalizedDirection,
    };
  }
  if (record.mode === 'audio-cross-fade' || record.type === 'audio-cross-fade' || record.mode === 'custom-shader' || record.type === 'custom-shader') {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_INVALID', 'Unsupported transition mode for M5A', {
      path,
      sceneEntryId,
      details: { mode: record.mode, type: record.type },
      recovery: 'Use cut or a built-in visual timeline-transition',
    }));
    return undefined;
  }
  errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_INVALID', 'Unknown transition mode', {
    path,
    sceneEntryId,
    recovery: 'Use mode "cut" or "timeline-transition"',
  }));
  return undefined;
}

function defaultTransition(): VideoPlanTransitionV1 {
  return { mode: 'cut' };
}

export function normalizeVideoPlan(input: unknown): VideoPlanNormalizationResult {
  const errors: VideoPlanDiagnostic[] = [];
  const warnings: VideoPlanDiagnostic[] = [];

  if (!isJsonSerializable(input) || input === undefined) {
    return {
      ok: false,
      errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'VideoPlan must be JSON-serializable (no NaN/Infinity/functions/circular refs)', {
        recovery: 'Pass a plain JSON object',
      })],
      warnings,
    };
  }

  const serialized = stableStringify(input);
  if (utf8ByteLength(serialized) > MAX_VIDEO_PLAN_SERIALIZED_BYTES) {
    return {
      ok: false,
      errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_TOO_LARGE', `Serialized plan exceeds ${MAX_VIDEO_PLAN_SERIALIZED_BYTES} bytes`, {
        recovery: 'Reduce scene count or embedded binding size',
      })],
      warnings,
    };
  }

  const record = asRecord(deepCloneJson(input));
  if (!record) {
    return {
      ok: false,
      errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'VideoPlan must be an object', {
        recovery: 'Pass a VideoPlanV1 object',
      })],
      warnings,
    };
  }

  for (const key of Object.keys(record)) {
    if (!VIDEO_PLAN_KNOWN_ROOT_KEYS.has(key)) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', `Unknown field "${key}"`, {
        path: key,
        recovery: 'Remove unknown fields',
      }));
    }
  }

  if (record.schemaVersion !== VIDEO_PLAN_SCHEMA_VERSION) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion ${String(record.schemaVersion)}`, {
      path: 'schemaVersion',
      recovery: 'Use schemaVersion "1.0.0"',
    }));
  }

  const id = trimString(record.id)?.toLowerCase();
  if (!id || !VIDEO_PLAN_ID_PATTERN.test(id)) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_INVALID_ID', 'Invalid plan id', {
      path: 'id',
      recovery: 'Use lowercase ids like video-plan.hawking-radiation',
    }));
  }

  const name = trimString(record.name);
  if (!name) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_EMPTY', 'Plan name must be a non-empty string', {
      path: 'name',
      recovery: 'Provide a human-readable name',
    }));
  }

  const description = trimString(record.description);

  const outputRaw = asRecord(record.output);
  if (!outputRaw) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'output is required', {
      path: 'output',
      recovery: 'Provide output.width/height/fps',
    }));
  }

  const width = outputRaw?.width;
  const height = outputRaw?.height;
  const fps = outputRaw?.fps;
  let fit: 'contain' | 'cover' = 'contain';
  if (outputRaw?.fit === 'cover' || outputRaw?.fit === 'contain') fit = outputRaw.fit;
  else if (outputRaw?.fit !== undefined) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'output.fit must be contain or cover', {
      path: 'output.fit',
      recovery: 'Use contain or cover',
    }));
  }

  if (typeof width !== 'number' || !Number.isInteger(width) || width < OUTPUT_WIDTH_MIN || width > OUTPUT_WIDTH_MAX) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', `output.width must be integer ${OUTPUT_WIDTH_MIN}..${OUTPUT_WIDTH_MAX}`, {
      path: 'output.width',
      recovery: 'Choose a supported timeline width',
    }));
  }
  if (typeof height !== 'number' || !Number.isInteger(height) || height < OUTPUT_HEIGHT_MIN || height > OUTPUT_HEIGHT_MAX) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', `output.height must be integer ${OUTPUT_HEIGHT_MIN}..${OUTPUT_HEIGHT_MAX}`, {
      path: 'output.height',
      recovery: 'Choose a supported timeline height',
    }));
  }
  if (typeof fps !== 'number' || !Number.isInteger(fps) || fps < OUTPUT_FPS_MIN || fps > OUTPUT_FPS_MAX) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', `output.fps must be integer ${OUTPUT_FPS_MIN}..${OUTPUT_FPS_MAX}`, {
      path: 'output.fps',
      recovery: 'Choose a supported timeline fps',
    }));
  }

  const sceneCanvasPolicy = record.sceneCanvasPolicy === 'allow-fit' ? 'allow-fit' : 'require-match';
  if (record.sceneCanvasPolicy !== undefined && record.sceneCanvasPolicy !== 'require-match' && record.sceneCanvasPolicy !== 'allow-fit') {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'sceneCanvasPolicy must be require-match or allow-fit', {
      path: 'sceneCanvasPolicy',
      recovery: 'Use require-match (default) or allow-fit',
    }));
  }

  const placementRaw = asRecord(record.placement) ?? {};
  const placementMode = placementRaw.mode === 'at-frame' ? 'at-frame' : 'append';
  if (placementRaw.mode !== undefined && placementRaw.mode !== 'append' && placementRaw.mode !== 'at-frame') {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'placement.mode must be append or at-frame', {
      path: 'placement.mode',
      recovery: 'Use append or at-frame',
    }));
  }
  let startFrame: number | undefined;
  if (placementMode === 'at-frame') {
    if (typeof placementRaw.startFrame !== 'number' || !Number.isInteger(placementRaw.startFrame) || placementRaw.startFrame < 0) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'placement.startFrame must be an integer >= 0 for at-frame', {
        path: 'placement.startFrame',
        recovery: 'Pass startFrame >= 0',
      }));
    } else {
      startFrame = placementRaw.startFrame;
    }
  } else if (placementRaw.startFrame !== undefined) {
    if (typeof placementRaw.startFrame === 'number' && Number.isInteger(placementRaw.startFrame) && placementRaw.startFrame >= 0) {
      startFrame = placementRaw.startFrame;
    }
  }
  const targetTrack = typeof placementRaw.targetTrack === 'string' ? placementRaw.targetTrack.trim() || undefined : undefined;
  let collisionPolicy: 'require-clear' | 'ripple' = 'require-clear';
  if (placementRaw.collisionPolicy === 'ripple' || placementRaw.collisionPolicy === 'require-clear') {
    collisionPolicy = placementRaw.collisionPolicy;
  } else if (placementRaw.collisionPolicy !== undefined) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'collisionPolicy must be require-clear or ripple', {
      path: 'placement.collisionPolicy',
      recovery: 'Use require-clear or ripple',
    }));
  }

  const markersRaw = asRecord(record.markers) ?? {};
  let markerMode: 'none' | 'boundary' | 'range' | 'both' = 'boundary';
  if (markersRaw.mode === 'none' || markersRaw.mode === 'boundary' || markersRaw.mode === 'range' || markersRaw.mode === 'both') {
    markerMode = markersRaw.mode;
  } else if (markersRaw.mode !== undefined) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_MARKER_INVALID', 'markers.mode must be none|boundary|range|both', {
      path: 'markers.mode',
      recovery: 'Choose a supported marker mode',
    }));
  }
  let defaultColor: VideoPlanMarkerColor = 'blue';
  if (markersRaw.defaultColor !== undefined) {
    if (isMarkerColor(markersRaw.defaultColor)) defaultColor = markersRaw.defaultColor;
    else {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_MARKER_INVALID', 'Invalid markers.defaultColor', {
        path: 'markers.defaultColor',
        recovery: 'Use a MarkerColor enum value',
      }));
    }
  }
  let notePrefix = 'BCC Scene';
  if (markersRaw.notePrefix !== undefined) {
    const prefix = trimString(markersRaw.notePrefix);
    if (!prefix || prefix.length > MAX_MARKER_NOTE_LENGTH) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_MARKER_INVALID', 'Invalid markers.notePrefix', {
        path: 'markers.notePrefix',
        recovery: `Provide a non-empty notePrefix up to ${MAX_MARKER_NOTE_LENGTH} chars`,
      }));
    } else {
      notePrefix = prefix;
    }
  }

  const defaultsRaw = asRecord(record.defaults) ?? {};
  let defaultGap = 0;
  if (defaultsRaw.gapAfterFrames !== undefined) {
    if (typeof defaultsRaw.gapAfterFrames !== 'number' || !Number.isInteger(defaultsRaw.gapAfterFrames)
      || defaultsRaw.gapAfterFrames < 0 || defaultsRaw.gapAfterFrames > MAX_GAP_AFTER_FRAMES) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_GAP_INVALID', `defaults.gapAfterFrames must be 0..${MAX_GAP_AFTER_FRAMES}`, {
        path: 'defaults.gapAfterFrames',
        recovery: 'Use an integer gap within limits',
      }));
    } else {
      defaultGap = defaultsRaw.gapAfterFrames;
    }
  }
  const defaultTransitionToNext = normalizeTransition(
    defaultsRaw.transitionToNext ?? defaultTransition(),
    'defaults.transitionToNext',
    errors,
  ) ?? defaultTransition();

  if (!Array.isArray(record.scenes) || record.scenes.length === 0) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_EMPTY', 'scenes must be a non-empty array', {
      path: 'scenes',
      recovery: 'Add at least one scene entry with an embedded SceneClipBindingV1',
    }));
  } else if (record.scenes.length > MAX_VIDEO_PLAN_SCENES) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TOO_MANY_SCENES', `At most ${MAX_VIDEO_PLAN_SCENES} scenes allowed`, {
      path: 'scenes',
      recovery: 'Split into multiple VideoPlans',
    }));
  }

  const scenes: VideoPlanSceneEntryV1[] = [];
  const seenIds = new Set<string>();
  const bindingHashes = new Map<string, string[]>();

  if (Array.isArray(record.scenes)) {
    for (let i = 0; i < record.scenes.length; i += 1) {
      const sceneRaw = asRecord(record.scenes[i]);
      const path = `scenes[${i}]`;
      if (!sceneRaw) {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', 'Scene entry must be an object', {
          path,
          recovery: 'Provide a VideoPlanSceneEntryV1 object',
        }));
        continue;
      }
      for (const key of Object.keys(sceneRaw)) {
        if (!VIDEO_PLAN_SCENE_KNOWN_KEYS.has(key)) {
          errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCHEMA_UNSUPPORTED', `Unknown scene field "${key}"`, {
            path: `${path}.${key}`,
            recovery: 'Remove unknown fields',
          }));
        }
      }

      const entryId = trimString(sceneRaw.id);
      if (!entryId || !VIDEO_PLAN_SCENE_ENTRY_ID_PATTERN.test(entryId)) {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_INVALID_ID', 'Invalid scene entry id', {
          path: `${path}.id`,
          recovery: 'Use ids matching ^[A-Za-z][A-Za-z0-9_-]{0,63}$',
        }));
        continue;
      }
      if (seenIds.has(entryId)) {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_DUPLICATE_SCENE_ENTRY_ID', `Duplicate scene entry id "${entryId}"`, {
          path: `${path}.id`,
          sceneEntryId: entryId,
          recovery: 'Give each scene a unique id',
        }));
        continue;
      }
      seenIds.add(entryId);

      const bindingResult = validateSceneClipBinding(sceneRaw.binding);
      if (!bindingResult.valid || !bindingResult.binding) {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_BINDING_INVALID', 'Scene binding failed validation', {
          path: `${path}.binding`,
          sceneEntryId: entryId,
          details: { errors: bindingResult.errors },
          recovery: 'Generate binding with scene_draft_get_binding_payload',
        }));
        continue;
      }
      const binding = bindingResult.binding;
      for (const warning of bindingResult.warnings) {
        warnings.push(videoPlanDiagnostic('warning', warning.code, warning.message, {
          sceneEntryId: entryId,
          path: `${path}.binding`,
          details: warning.details,
          recovery: warning.recovery,
        }));
      }

      // Reject draft/candidate runtime dependencies if exposed on assets status-like fields
      for (const asset of binding.dependencies.assets) {
        if ((asset as { status?: string }).status === 'deprecated') {
          warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_SCENE_BINDING_INVALID', `Deprecated asset dependency ${asset.id}@${asset.version}`, {
            sceneEntryId: entryId,
            recovery: 'Prefer published assets when possible',
          }));
        }
        if ((asset as { status?: string }).status === 'staging') {
          warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_SCENE_BINDING_INVALID', `Staging runtime dependency ${asset.id}@${asset.version}`, {
            sceneEntryId: entryId,
            recovery: 'Publish the runtime before production export',
          }));
        }
      }

      if (typeof fps === 'number' && Number.isInteger(fps) && fps > 0) {
        if (sceneCanvasPolicy === 'require-match') {
          if (binding.scene.canvas.width !== width || binding.scene.canvas.height !== height) {
            errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_CANVAS_MISMATCH', 'Scene canvas must match plan output under require-match', {
              path: `${path}.binding.scene.canvas`,
              sceneEntryId: entryId,
              details: {
                sceneCanvas: binding.scene.canvas,
                planOutput: { width, height },
              },
              recovery: 'Use scenes matching output size or set sceneCanvasPolicy to allow-fit',
            }));
          }
        } else if (binding.scene.canvas.width !== width || binding.scene.canvas.height !== height) {
          warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_SCENE_CANVAS_MISMATCH', 'Scene canvas differs from plan output (allow-fit)', {
            path: `${path}.binding.scene.canvas`,
            sceneEntryId: entryId,
            recovery: 'Timeline fit will apply contain/cover',
          }));
        }
      }

      let durationMode: 'match-scene' | 'timeline-frames' = 'match-scene';
      let timelineFrames: number | undefined;
      const durationRaw = asRecord(sceneRaw.duration);
      if (durationRaw) {
        if (durationRaw.mode === 'timeline-frames') {
          durationMode = 'timeline-frames';
          if (typeof durationRaw.timelineFrames !== 'number' || !Number.isInteger(durationRaw.timelineFrames) || durationRaw.timelineFrames < 1) {
            errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_DURATION_INVALID', 'timelineFrames must be an integer >= 1', {
              path: `${path}.duration.timelineFrames`,
              sceneEntryId: entryId,
              recovery: 'Pass timelineFrames >= 1',
            }));
          } else {
            timelineFrames = durationRaw.timelineFrames;
            if (typeof fps === 'number' && fps > 0) {
              const matchFrames = sceneDurationToTimelineFrames({
                sceneDurationInFrames: binding.scene.durationInFrames,
                sceneFps: binding.scene.fps,
                timelineFps: fps,
              });
              const delta = Math.abs(timelineFrames - matchFrames) / matchFrames;
              if (delta > 0.25) {
                if (timelineFrames < matchFrames) {
                  warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_SCENE_DURATION_INVALID', 'Fixed timeline duration truncates scene (>25% shorter)', {
                    sceneEntryId: entryId,
                    details: { timelineFrames, matchFrames },
                    recovery: 'Increase timelineFrames or use match-scene',
                  }));
                } else {
                  warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_SCENE_DURATION_INVALID', 'Fixed timeline duration holds last frame (>25% longer)', {
                    sceneEntryId: entryId,
                    details: { timelineFrames, matchFrames },
                    recovery: 'Decrease timelineFrames or use match-scene',
                  }));
                }
              }
            }
          }
        } else if (durationRaw.mode === 'match-scene' || durationRaw.mode === undefined) {
          durationMode = 'match-scene';
        } else {
          errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_DURATION_INVALID', 'duration.mode must be match-scene or timeline-frames', {
            path: `${path}.duration.mode`,
            sceneEntryId: entryId,
            recovery: 'Use match-scene or timeline-frames',
          }));
        }
      }

      let gapAfterFrames = defaultGap;
      if (sceneRaw.gapAfterFrames !== undefined) {
        if (typeof sceneRaw.gapAfterFrames !== 'number' || !Number.isInteger(sceneRaw.gapAfterFrames)
          || sceneRaw.gapAfterFrames < 0 || sceneRaw.gapAfterFrames > MAX_GAP_AFTER_FRAMES) {
          errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_GAP_INVALID', `gapAfterFrames must be 0..${MAX_GAP_AFTER_FRAMES}`, {
            path: `${path}.gapAfterFrames`,
            sceneEntryId: entryId,
            recovery: 'Use an integer gap within limits',
          }));
        } else {
          gapAfterFrames = sceneRaw.gapAfterFrames;
        }
      }

      const isLast = i === record.scenes.length - 1;
      let transitionToNext = normalizeTransition(
        sceneRaw.transitionToNext ?? defaultTransitionToNext,
        `${path}.transitionToNext`,
        errors,
        entryId,
      ) ?? defaultTransitionToNext;

      if (isLast) {
        if (transitionToNext.mode === 'timeline-transition') {
          errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_ON_LAST_SCENE', 'Last scene cannot have a timeline-transition', {
            path: `${path}.transitionToNext`,
            sceneEntryId: entryId,
            recovery: 'Use cut/undefined on the last scene',
          }));
        }
        transitionToNext = { mode: 'cut' };
      } else if (transitionToNext.mode === 'timeline-transition' && gapAfterFrames !== 0) {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_REQUIRES_ADJACENCY', 'timeline-transition requires gapAfterFrames = 0', {
          path: `${path}.transitionToNext`,
          sceneEntryId: entryId,
          recovery: 'Set gapAfterFrames to 0 or use cut',
        }));
      }

      if (transitionToNext.mode === 'timeline-transition' && transitionToNext.durationInFrames > 120) {
        warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_TRANSITION_INVALID', 'Very long transition duration', {
          sceneEntryId: entryId,
          details: { durationInFrames: transitionToNext.durationInFrames },
          recovery: 'Prefer shorter transitions for clarity',
        }));
      }

      let markerNote: string | undefined;
      let markerColor: VideoPlanMarkerColor | undefined;
      const markerRaw = asRecord(sceneRaw.marker);
      if (markerRaw) {
        if (markerRaw.note !== undefined) {
          const note = trimString(markerRaw.note);
          if (!note || note.length > MAX_MARKER_NOTE_LENGTH) {
            errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_MARKER_INVALID', 'Invalid marker.note', {
              path: `${path}.marker.note`,
              sceneEntryId: entryId,
              recovery: `Provide a note up to ${MAX_MARKER_NOTE_LENGTH} chars`,
            }));
          } else {
            markerNote = note;
          }
        }
        if (markerRaw.color !== undefined) {
          if (isMarkerColor(markerRaw.color)) markerColor = markerRaw.color;
          else {
            errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_MARKER_INVALID', 'Invalid marker.color', {
              path: `${path}.marker.color`,
              sceneEntryId: entryId,
              recovery: 'Use a MarkerColor enum value',
            }));
          }
        }
      }

      if (typeof fps === 'number' && fps > 0) {
        const resolved = durationMode === 'timeline-frames' && timelineFrames
          ? timelineFrames
          : sceneDurationToTimelineFrames({
            sceneDurationInFrames: binding.scene.durationInFrames,
            sceneFps: binding.scene.fps,
            timelineFps: fps,
          });
        if (resolved < 3) {
          warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_SCENE_DURATION_INVALID', 'Very short scene duration', {
            sceneEntryId: entryId,
            details: { durationInFrames: resolved },
            recovery: 'Lengthen the scene if possible',
          }));
        }
      }

      const hashes = bindingHashes.get(binding.bindingPayloadHash) ?? [];
      hashes.push(entryId);
      bindingHashes.set(binding.bindingPayloadHash, hashes);

      const entry: VideoPlanSceneEntryV1 = {
        id: entryId,
        binding,
        duration: durationMode === 'timeline-frames'
          ? { mode: 'timeline-frames', timelineFrames }
          : { mode: 'match-scene' },
        gapAfterFrames,
        transitionToNext,
      };
      const entryName = trimString(sceneRaw.name);
      if (entryName) entry.name = entryName;
      const entryDescription = trimString(sceneRaw.description);
      if (entryDescription) entry.description = entryDescription;
      if (markerNote || markerColor) {
        entry.marker = {};
        if (markerNote) entry.marker.note = markerNote;
        if (markerColor) entry.marker.color = markerColor;
      }
      scenes.push(entry);
    }
  }

  for (const [hash, ids] of bindingHashes) {
    if (ids.length > 1) {
      warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_DUPLICATE_SCENE_ENTRY_ID', 'Repeated exact scene binding across entries', {
        details: { bindingPayloadHash: hash, sceneEntryIds: ids },
        recovery: 'Reuse is allowed; confirm intentional duplication',
      }));
    }
  }

  if (scenes.length > 0) {
    const last = scenes[scenes.length - 1]!;
    if ((last.gapAfterFrames ?? 0) > 0) {
      warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_GAP_INVALID', 'Trailing gap after last scene creates blank range', {
        sceneEntryId: last.id,
        details: { gapAfterFrames: last.gapAfterFrames },
        recovery: 'Remove trailing gap unless intentional',
      }));
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const plan: VideoPlanV1 = {
    schemaVersion: '1.0.0',
    id: id!,
    name: name!,
    output: {
      width: width as number,
      height: height as number,
      fps: fps as number,
      fit,
    },
    sceneCanvasPolicy,
    placement: {
      mode: placementMode,
      collisionPolicy,
      ...(startFrame !== undefined ? { startFrame } : {}),
      ...(targetTrack ? { targetTrack } : {}),
    },
    markers: {
      mode: markerMode,
      defaultColor,
      notePrefix,
    },
    defaults: {
      gapAfterFrames: defaultGap,
      transitionToNext: defaultTransitionToNext,
    },
    scenes,
  };
  if (description) plan.description = description;

  return { ok: true, plan, errors, warnings };
}
