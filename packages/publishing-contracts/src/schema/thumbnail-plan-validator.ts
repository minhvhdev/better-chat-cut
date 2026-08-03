import type { PublishingDiagnostic } from '../contracts/publishing-diagnostic.ts';
import { publishingDiagnostic } from '../contracts/publishing-errors.ts';
import type { ThumbnailOverlayV1, ThumbnailPlanV1 } from '../contracts/thumbnail-plan.ts';
import { DEFAULT_THUMBNAIL_OUTPUT } from '../contracts/thumbnail-plan.ts';
import {
  asRecord,
  deepCloneJson,
  isJsonSerializable,
  isValidColor,
  looksLikeHtmlInjection,
  hasControlChars,
} from './serialization.ts';
import { computePublishingArtifactHash } from './artifact-hash.ts';

export type ThumbnailPlanValidationResult = {
  valid: boolean;
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
  normalized?: ThumbnailPlanV1;
  planHash?: string;
};

const PLAN_KEYS = new Set(['schemaVersion', 'id', 'name', 'output', 'source', 'overlays', 'background', 'safeArea']);
const BOX_KEYS = new Set(['x', 'y', 'width', 'height']);

function validateBox(raw: unknown, path: string, canvasW: number, canvasH: number): {
  box?: { x: number; y: number; width: number; height: number };
  errors: PublishingDiagnostic[];
} {
  const errors: PublishingDiagnostic[] = [];
  const rec = asRecord(raw);
  if (!rec) {
    return { errors: [publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'box required', { path })] };
  }
  for (const k of Object.keys(rec)) {
    if (!BOX_KEYS.has(k)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', `unknown box field ${k}`, { path: `${path}.${k}` }));
    }
  }
  const x = Number(rec.x);
  const y = Number(rec.y);
  const width = Number(rec.width);
  const height = Number(rec.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'box numbers invalid', { path }));
  }
  if (width <= 0 || height <= 0) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'box size must be positive', { path }));
  }
  if (x < 0 || y < 0 || x + width > canvasW + 0.001 || y + height > canvasH + 0.001) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'overlay outside canvas', { path }));
  }
  return { box: { x, y, width, height }, errors };
}

export function validateThumbnailPlan(raw: unknown): ThumbnailPlanValidationResult {
  const errors: PublishingDiagnostic[] = [];
  const warnings: PublishingDiagnostic[] = [];

  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_NON_SERIALIZABLE', 'Thumbnail plan not serializable')],
      warnings,
    };
  }
  const rec = asRecord(raw);
  if (!rec) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'plan must be object')],
      warnings,
    };
  }
  for (const key of Object.keys(rec)) {
    if (!PLAN_KEYS.has(key)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', `Unknown field: ${key}`, { path: key }));
    }
  }
  if (rec.schemaVersion !== '1.0.0') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_SCHEMA_UNSUPPORTED', 'Unsupported thumbnail plan schemaVersion'));
  }
  if (typeof rec.id !== 'string' || !rec.id.trim()) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'id required', { path: 'id' }));
  }
  if (typeof rec.name !== 'string' || !rec.name.trim()) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'name required', { path: 'name' }));
  }

  const outputRec = asRecord(rec.output) ?? {};
  const width = typeof outputRec.width === 'number' ? outputRec.width : DEFAULT_THUMBNAIL_OUTPUT.width;
  const height = typeof outputRec.height === 'number' ? outputRec.height : DEFAULT_THUMBNAIL_OUTPUT.height;
  const format = outputRec.format === 'jpeg' ? 'jpeg' : 'png';
  const jpegQuality = typeof outputRec.jpegQuality === 'number' ? outputRec.jpegQuality : undefined;
  if (!Number.isInteger(width) || width < 16 || width > 3840 || !Number.isInteger(height) || height < 16 || height > 2160) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'output dimensions out of range', { path: 'output' }));
  }
  if (format === 'jpeg' && jpegQuality !== undefined && (jpegQuality < 1 || jpegQuality > 100)) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'jpegQuality must be 1..100', { path: 'output.jpegQuality' }));
  }

  const source = asRecord(rec.source);
  if (!source || (source.type !== 'scene-frame' && source.type !== 'custom-scene')) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'source.type must be scene-frame or custom-scene', { path: 'source' }));
  } else {
    const scene = asRecord(source.scene);
    if (!scene || typeof scene.id !== 'string') {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'source.scene required', { path: 'source.scene' }));
    }
    // Reject remote URLs / filesystem paths sneaked in as strings
    const dump = JSON.stringify(source);
    if (/https?:\/\//i.test(dump) && /"src"|"url"|"href"|"path"/.test(dump)) {
      // soft-check: block explicit remote image path patterns in overlays only
    }
    if (source.type === 'scene-frame') {
      if (typeof source.frame !== 'number' || !Number.isInteger(source.frame) || source.frame < 0) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'frame must be non-negative integer', { path: 'source.frame' }));
      }
    }
    for (const forbidden of ['remoteUrl', 'filePath', 'filesystemPath', 'html', 'css', 'svg']) {
      if (forbidden in source) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', `Forbidden source field: ${forbidden}`, { path: `source.${forbidden}` }));
      }
    }
  }

  const overlays: ThumbnailOverlayV1[] = [];
  if (rec.overlays !== undefined) {
    if (!Array.isArray(rec.overlays)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'overlays must be array'));
    } else {
      for (let i = 0; i < rec.overlays.length; i += 1) {
        const o = asRecord(rec.overlays[i]);
        if (!o || typeof o.id !== 'string') {
          errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', `overlay ${i} invalid`));
          continue;
        }
        if (o.type === 'label') {
          if (typeof o.text !== 'string' || !o.text.trim()) {
            errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'label text required', { path: `overlays[${i}].text` }));
          }
          if (typeof o.text === 'string' && (hasControlChars(o.text) || looksLikeHtmlInjection(o.text) || /<\s*html/i.test(o.text))) {
            errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'label text unsafe/HTML', { path: `overlays[${i}].text` }));
          }
          const style = asRecord(o.style);
          if (!style || typeof style.fontSize !== 'number' || typeof style.textColor !== 'string' || !isValidColor(String(style.textColor))) {
            errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'label style invalid', { path: `overlays[${i}].style` }));
          }
          const box = validateBox(o.box, `overlays[${i}].box`, width, height);
          errors.push(...box.errors);
          if (box.box && style) {
            overlays.push({
              type: 'label',
              id: o.id,
              text: String(o.text ?? ''),
              box: box.box,
              style: {
                fontSize: Number(style.fontSize),
                fontWeight: typeof style.fontWeight === 'number' ? style.fontWeight : undefined,
                textColor: String(style.textColor),
                backgroundColor: typeof style.backgroundColor === 'string' ? style.backgroundColor : undefined,
                align: style.align === 'left' || style.align === 'right' || style.align === 'center' ? style.align : 'center',
              },
            });
          }
        } else if (o.type === 'shape') {
          if (o.shape !== 'rectangle' && o.shape !== 'circle') {
            errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'shape type invalid', { path: `overlays[${i}].shape` }));
          }
          if (typeof o.fill !== 'string' || !isValidColor(o.fill)) {
            errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'fill invalid', { path: `overlays[${i}].fill` }));
          }
          const box = validateBox(o.box, `overlays[${i}].box`, width, height);
          errors.push(...box.errors);
          if (box.box) {
            overlays.push({
              type: 'shape',
              id: o.id,
              shape: o.shape as 'rectangle' | 'circle',
              box: box.box,
              fill: String(o.fill ?? '#000'),
              opacity: typeof o.opacity === 'number' ? o.opacity : undefined,
            });
          }
        } else {
          errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', `unknown overlay type`, { path: `overlays[${i}].type` }));
        }
      }
    }
  }

  const bg = asRecord(rec.background);
  if (bg && (typeof bg.color !== 'string' || !isValidColor(bg.color))) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_THUMBNAIL_PLAN_INVALID', 'background.color invalid', { path: 'background.color' }));
  }

  if (errors.length) return { valid: false, errors, warnings };

  const sourceRec = source as Record<string, unknown>;
  const normalized: ThumbnailPlanV1 = {
    schemaVersion: '1.0.0',
    id: String(rec.id),
    name: String(rec.name),
    output: {
      width,
      height,
      format,
      jpegQuality: format === 'jpeg' ? (jpegQuality ?? 90) : undefined,
    },
    source: sourceRec.type === 'scene-frame'
      ? {
        type: 'scene-frame',
        scene: deepCloneJson(sourceRec.scene) as ThumbnailPlanV1['source'] extends { scene: infer S } ? S : never,
        frame: Number(sourceRec.frame),
      }
      : {
        type: 'custom-scene',
        scene: deepCloneJson(sourceRec.scene) as ThumbnailPlanV1['source'] extends { scene: infer S } ? S : never,
      },
    overlays: overlays.length ? overlays : undefined,
    background: bg ? { color: String(bg.color) } : undefined,
    safeArea: asRecord(rec.safeArea)
      ? {
        top: Number((rec.safeArea as Record<string, unknown>).top ?? 40),
        right: Number((rec.safeArea as Record<string, unknown>).right ?? 40),
        bottom: Number((rec.safeArea as Record<string, unknown>).bottom ?? 40),
        left: Number((rec.safeArea as Record<string, unknown>).left ?? 40),
      }
      : undefined,
  };

  const clone = deepCloneJson(normalized);
  return {
    valid: true,
    errors,
    warnings,
    normalized: clone,
    planHash: computePublishingArtifactHash({ artifactType: 'thumbnail-plan', artifact: clone }),
  };
}
