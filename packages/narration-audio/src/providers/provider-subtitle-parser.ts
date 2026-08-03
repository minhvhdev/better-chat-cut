import type { NarrationWordV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';
import { estimateWordTimings } from '../../../narration-plans/src/timing/estimated-word-timing.ts';

export type ParsedProviderTiming = {
  quality: 'provider-word' | 'provider-sentence' | 'estimated-word' | 'segment-only';
  words: NarrationWordV1[];
};

function clampWords(words: NarrationWordV1[], durationMs: number): NarrationWordV1[] {
  const out: NarrationWordV1[] = [];
  let cursor = 0;
  for (const w of words) {
    if (!w.text.trim()) continue;
    let start = Number.isFinite(w.start) ? Math.max(0, w.start) : cursor;
    let end = Number.isFinite(w.end) ? w.end : start + 1;
    if (start < cursor) start = cursor;
    if (end <= start) end = start + 1;
    if (end > durationMs) end = durationMs;
    if (start >= durationMs) break;
    out.push({ text: w.text, start, end, speaker: w.speaker });
    cursor = end;
  }
  if (out.length > 0) out[out.length - 1]!.end = Math.max(out[out.length - 1]!.end, Math.min(durationMs, out[out.length - 1]!.end));
  return out;
}

function sentenceToWords(sentences: NarrationWordV1[], durationMs: number, fullText: string): NarrationWordV1[] {
  const words: NarrationWordV1[] = [];
  for (const sentence of sentences) {
    const span = Math.max(1, sentence.end - sentence.start);
    const estimated = estimateWordTimings({
      text: sentence.text || fullText,
      durationMs: span,
      language: 'und',
    });
    for (const w of estimated) {
      words.push({
        text: w.text,
        start: sentence.start + w.start,
        end: sentence.start + w.end,
      });
    }
  }
  return clampWords(words.length ? words : estimateWordTimings({ text: fullText, durationMs, language: 'und' }), durationMs);
}

/**
 * Parse provider subtitle / timing payloads. Deterministic fallbacks when missing.
 */
export function parseProviderSubtitleTiming(input: {
  raw: unknown;
  text: string;
  durationMs: number;
  language: string;
  requested?: 'none' | 'sentence' | 'word';
}): ParsedProviderTiming {
  const durationMs = Math.max(1, Math.floor(input.durationMs));
  if (input.raw == null || input.requested === 'none') {
    return {
      quality: 'estimated-word',
      words: estimateWordTimings({ text: input.text, durationMs, language: input.language }),
    };
  }

  let parsed: unknown = input.raw;
  if (typeof input.raw === 'string') {
    try {
      parsed = JSON.parse(input.raw);
    } catch {
      return {
        quality: 'estimated-word',
        words: estimateWordTimings({ text: input.text, durationMs, language: input.language }),
      };
    }
  }

  const asWords = (value: unknown): NarrationWordV1[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const rec = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const text = typeof rec.text === 'string' ? rec.text
        : typeof rec.word === 'string' ? rec.word
          : typeof rec.content === 'string' ? rec.content
            : '';
      const start = typeof rec.start === 'number' ? rec.start
        : typeof rec.begin_time === 'number' ? rec.begin_time
          : typeof rec.start_time === 'number' ? rec.start_time
            : Number.NaN;
      const end = typeof rec.end === 'number' ? rec.end
        : typeof rec.end_time === 'number' ? rec.end_time
          : Number.NaN;
      return { text, start, end };
    }).filter((w) => w.text);
  };

  const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;

  const wordCandidates = asWords(
    Array.isArray(parsed) ? parsed
      : record?.words ?? record?.word_list ?? record?.subtitles ?? record?.sentences,
  );

  if (wordCandidates.length === 0) {
    return {
      quality: 'estimated-word',
      words: estimateWordTimings({ text: input.text, durationMs, language: input.language }),
    };
  }

  const looksLikeSentences = wordCandidates.every((w) => /\s/.test(w.text.trim()))
    || input.requested === 'sentence'
    || (record && ('sentences' in record || record.subtitle_type === 'sentence'));

  if (looksLikeSentences && input.requested !== 'word') {
    return {
      quality: 'provider-sentence',
      words: sentenceToWords(clampWords(wordCandidates, durationMs), durationMs, input.text),
    };
  }

  const clamped = clampWords(wordCandidates, durationMs);
  if (clamped.length === 0) {
    return {
      quality: 'estimated-word',
      words: estimateWordTimings({ text: input.text, durationMs, language: input.language }),
    };
  }
  return { quality: 'provider-word', words: clamped };
}
