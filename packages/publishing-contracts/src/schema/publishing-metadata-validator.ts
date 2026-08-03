import type { PublishingDiagnostic } from '../contracts/publishing-diagnostic.ts';
import { publishingDiagnostic } from '../contracts/publishing-errors.ts';
import {
  PUBLISHING_METADATA_LIMITS,
  type PublishingMetadataV1,
} from '../contracts/publishing-metadata.ts';
import type { PublishingChapterV1 } from '../contracts/publishing-chapter.ts';
import type { PublishingPlatformCapabilitiesV1 } from '../contracts/publishing-target.ts';
import {
  asRecord,
  deepCloneJson,
  hasControlChars,
  isJsonSerializable,
  isValidHttpUrl,
  looksLikeHtmlInjection,
  stableStringify,
  utf8ByteLength,
} from './serialization.ts';
import { computeMetadataHash } from './artifact-hash.ts';
import { normalizeTags } from './normalization.ts';

export type MetadataValidationResult = {
  valid: boolean;
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
  normalized?: PublishingMetadataV1;
  metadataHash?: string;
};

const META_KEYS = new Set([
  'schemaVersion', 'title', 'description', 'language', 'tags', 'category',
  'chapters', 'credits', 'sourceAttributions', 'callToAction', 'targetOverrides',
]);

function validateChapters(
  raw: unknown,
  durationMs?: number,
): { chapters?: PublishingChapterV1[]; errors: PublishingDiagnostic[] } {
  const errors: PublishingDiagnostic[] = [];
  if (raw === undefined) return { errors };
  if (!Array.isArray(raw)) {
    return { errors: [publishingDiagnostic('error', 'PUBLISHING_CHAPTERS_INVALID', 'chapters must be an array', { path: 'chapters' })] };
  }
  if (raw.length > PUBLISHING_METADATA_LIMITS.MAX_CHAPTERS) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_CHAPTERS_INVALID', 'too many chapters', { path: 'chapters' }));
  }
  const chapters: PublishingChapterV1[] = [];
  let lastStart = -1;
  const ids = new Set<string>();
  for (let i = 0; i < raw.length; i += 1) {
    const c = asRecord(raw[i]);
    if (!c || typeof c.id !== 'string' || !c.id.trim()
      || typeof c.title !== 'string' || !c.title.trim()
      || typeof c.startMs !== 'number' || !Number.isFinite(c.startMs) || c.startMs < 0
    ) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_CHAPTERS_INVALID', `invalid chapter at ${i}`, { path: `chapters[${i}]` }));
      continue;
    }
    if (ids.has(c.id)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_CHAPTERS_INVALID', `duplicate chapter id ${c.id}`, { path: `chapters[${i}].id` }));
    }
    ids.add(c.id);
    if (c.startMs <= lastStart) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_CHAPTERS_INVALID', 'chapter startMs must be strictly increasing', { path: `chapters[${i}].startMs` }));
    }
    lastStart = c.startMs;
    if (durationMs !== undefined && c.startMs > durationMs) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_CHAPTERS_INVALID', 'chapter starts beyond video duration', { path: `chapters[${i}].startMs` }));
    }
    if (hasControlChars(c.title) || looksLikeHtmlInjection(c.title)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_CHAPTERS_INVALID', 'chapter title unsafe', { path: `chapters[${i}].title` }));
    }
    chapters.push({
      id: c.id,
      startMs: Math.floor(c.startMs),
      title: c.title.trim(),
      sourceSceneEntryId: typeof c.sourceSceneEntryId === 'string' ? c.sourceSceneEntryId : undefined,
    });
  }
  return { chapters, errors };
}

export function validatePublishingMetadata(
  raw: unknown,
  options?: {
    capabilities?: PublishingPlatformCapabilitiesV1;
    videoDurationMs?: number;
  },
): MetadataValidationResult {
  const errors: PublishingDiagnostic[] = [];
  const warnings: PublishingDiagnostic[] = [];
  const caps = options?.capabilities;

  if (!isJsonSerializable(raw)) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_NON_SERIALIZABLE', 'Metadata is not JSON-serializable')],
      warnings,
    };
  }
  if (utf8ByteLength(stableStringify(raw)) > PUBLISHING_METADATA_LIMITS.MAX_SERIALIZED_BYTES) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', 'Metadata too large')],
      warnings,
    };
  }

  const rec = asRecord(raw);
  if (!rec) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', 'Metadata must be an object')],
      warnings,
    };
  }
  for (const key of Object.keys(rec)) {
    if (!META_KEYS.has(key)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', `Unknown field: ${key}`, { path: key }));
    }
  }
  if (rec.schemaVersion !== '1.0.0') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_SCHEMA_UNSUPPORTED', 'Unsupported metadata schemaVersion'));
  }
  if (typeof rec.title !== 'string' || !rec.title.trim()) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', 'title required', { path: 'title' }));
  } else {
    if (hasControlChars(rec.title) || looksLikeHtmlInjection(rec.title)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', 'title unsafe', { path: 'title' }));
    }
    const maxTitle = caps?.metadata.maximumTitleLength ?? PUBLISHING_METADATA_LIMITS.MAX_TITLE_LENGTH;
    if (rec.title.length > maxTitle) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_PLATFORM_LIMIT_EXCEEDED', `title exceeds ${maxTitle}`, { path: 'title' }));
    }
  }
  if (typeof rec.description !== 'string') {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', 'description required', { path: 'description' }));
  } else {
    if (hasControlChars(rec.description) || looksLikeHtmlInjection(rec.description)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', 'description unsafe', { path: 'description' }));
    }
    const maxDesc = caps?.metadata.maximumDescriptionLength ?? PUBLISHING_METADATA_LIMITS.MAX_DESCRIPTION_LENGTH;
    if (rec.description.length > maxDesc) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_PLATFORM_LIMIT_EXCEEDED', `description exceeds ${maxDesc}`, { path: 'description' }));
    }
  }
  if (typeof rec.language !== 'string' || !rec.language.trim()) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', 'language required', { path: 'language' }));
  }
  if (!Array.isArray(rec.tags)) {
    errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', 'tags must be array', { path: 'tags' }));
  }

  const chapterResult = validateChapters(rec.chapters, options?.videoDurationMs);
  errors.push(...chapterResult.errors);

  // attributions
  let sourceAttributions: PublishingMetadataV1['sourceAttributions'];
  if (rec.sourceAttributions !== undefined) {
    if (!Array.isArray(rec.sourceAttributions)) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_SOURCE_ATTRIBUTION_INVALID', 'sourceAttributions must be array'));
    } else {
      sourceAttributions = [];
      for (let i = 0; i < rec.sourceAttributions.length; i += 1) {
        const a = asRecord(rec.sourceAttributions[i]);
        if (!a || typeof a.sourceId !== 'string' || typeof a.title !== 'string') {
          errors.push(publishingDiagnostic('error', 'PUBLISHING_SOURCE_ATTRIBUTION_INVALID', `invalid attribution ${i}`));
          continue;
        }
        if (a.url !== undefined && (typeof a.url !== 'string' || !isValidHttpUrl(a.url))) {
          errors.push(publishingDiagnostic('error', 'PUBLISHING_SOURCE_ATTRIBUTION_INVALID', `invalid attribution url ${i}`));
        }
        sourceAttributions.push({
          sourceId: a.sourceId,
          title: a.title,
          publisher: typeof a.publisher === 'string' ? a.publisher : undefined,
          url: typeof a.url === 'string' ? a.url : undefined,
        });
      }
    }
  }

  // target overrides
  let targetOverrides: PublishingMetadataV1['targetOverrides'];
  const overrides = asRecord(rec.targetOverrides);
  if (overrides) {
    const yt = asRecord(overrides.youtube);
    if (yt) {
      const allowed = new Set(['categoryId', 'defaultLanguage', 'defaultAudioLanguage', 'madeForKids', 'selfDeclaredMadeForKids']);
      for (const k of Object.keys(yt)) {
        if (!allowed.has(k)) {
          errors.push(publishingDiagnostic('error', 'PUBLISHING_METADATA_INVALID', `unsupported youtube override: ${k}`, { path: `targetOverrides.youtube.${k}` }));
        }
      }
      targetOverrides = {
        youtube: {
          categoryId: typeof yt.categoryId === 'string' ? yt.categoryId : undefined,
          defaultLanguage: typeof yt.defaultLanguage === 'string' ? yt.defaultLanguage : undefined,
          defaultAudioLanguage: typeof yt.defaultAudioLanguage === 'string' ? yt.defaultAudioLanguage : undefined,
          madeForKids: typeof yt.madeForKids === 'boolean' ? yt.madeForKids : undefined,
          selfDeclaredMadeForKids: typeof yt.selfDeclaredMadeForKids === 'boolean' ? yt.selfDeclaredMadeForKids : undefined,
        },
      };
    }
  }

  if (errors.length) return { valid: false, errors, warnings };

  const tags = normalizeTags((rec.tags as string[]).map(String));
  if (caps?.metadata.maximumTagCount && tags.length > caps.metadata.maximumTagCount) {
    return {
      valid: false,
      errors: [publishingDiagnostic('error', 'PUBLISHING_METADATA_PLATFORM_LIMIT_EXCEEDED', 'too many tags')],
      warnings,
    };
  }
  if (caps?.metadata.maximumCombinedTagLength) {
    const combined = tags.join('').length;
    if (combined > caps.metadata.maximumCombinedTagLength) {
      return {
        valid: false,
        errors: [publishingDiagnostic('error', 'PUBLISHING_METADATA_PLATFORM_LIMIT_EXCEEDED', 'combined tag length exceeded')],
        warnings,
      };
    }
  }

  const normalized: PublishingMetadataV1 = {
    schemaVersion: '1.0.0',
    title: String(rec.title).trim(),
    description: String(rec.description),
    language: String(rec.language).trim(),
    tags,
    category: typeof rec.category === 'string' ? rec.category : undefined,
    chapters: chapterResult.chapters,
    credits: Array.isArray(rec.credits)
      ? (rec.credits as unknown[]).map((c) => {
        const r = asRecord(c)!;
        return {
          label: String(r.label),
          value: String(r.value),
          url: typeof r.url === 'string' ? r.url : undefined,
        };
      })
      : undefined,
    sourceAttributions,
    callToAction: typeof rec.callToAction === 'string' ? rec.callToAction : undefined,
    targetOverrides,
  };

  const clone = deepCloneJson(normalized);
  return {
    valid: true,
    errors,
    warnings,
    normalized: clone,
    metadataHash: computeMetadataHash(clone),
  };
}
