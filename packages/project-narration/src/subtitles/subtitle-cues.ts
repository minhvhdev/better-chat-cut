import type { NarrationWordV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';
import type { SubtitleCueV1 } from '../contracts/narration-timeline-metadata.ts';
import { MAX_SUBTITLE_CUES } from '../../../narration-plans/src/contracts/narration-policy.ts';

export function buildSubtitleCues(input: {
  words: NarrationWordV1[];
  pacing: 'word' | 'phrase';
  maxWordsPerCue?: number;
  maxCharsPerLine?: number;
}): SubtitleCueV1[] {
  const words = [...input.words]
    .filter((w) => w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const maxWords = input.maxWordsPerCue ?? (input.pacing === 'word' ? 1 : 8);
  const maxChars = input.maxCharsPerLine ?? 42;
  const cues: SubtitleCueV1[] = [];
  let bucket: NarrationWordV1[] = [];

  const flush = () => {
    if (!bucket.length) return;
    const startMs = Math.max(0, bucket[0]!.start);
    let endMs = Math.max(startMs + 1, bucket[bucket.length - 1]!.end);
    const text = bucket.map((w) => w.text).join(input.pacing === 'word' && bucket.length === 1 ? '' : ' ').replace(/\s+/g, ' ').trim();
    if (!text) {
      bucket = [];
      return;
    }
    if (cues.length && startMs < cues[cues.length - 1]!.endMs) {
      // Clamp overlap
      cues[cues.length - 1]!.endMs = startMs;
      if (cues[cues.length - 1]!.endMs <= cues[cues.length - 1]!.startMs) {
        cues[cues.length - 1]!.endMs = cues[cues.length - 1]!.startMs + 1;
      }
    }
    cues.push({
      index: cues.length + 1,
      startMs,
      endMs,
      text: stripControls(text),
    });
    bucket = [];
  };

  for (const word of words) {
    const nextText = [...bucket, word].map((w) => w.text).join(' ');
    if (
      bucket.length >= maxWords
      || (bucket.length > 0 && nextText.length > maxChars)
      || (bucket.length > 0 && /[.!?…]$/.test(bucket[bucket.length - 1]!.text))
    ) {
      flush();
    }
    bucket.push(word);
    if (input.pacing === 'word') flush();
  }
  flush();

  return cues.slice(0, MAX_SUBTITLE_CUES).map((c, i) => ({ ...c, index: i + 1 }));
}

function stripControls(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function formatSrtTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

export function formatVttTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

export function serializeSrt(cues: SubtitleCueV1[]): string {
  const blocks = cues.map((cue, i) => {
    const index = i + 1;
    return `${index}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${stripControls(cue.text)}`;
  });
  return `${blocks.join('\n\n')}\n`;
}

export function serializeWebVtt(cues: SubtitleCueV1[]): string {
  const blocks = cues.map((cue) => (
    `${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}\n${stripControls(cue.text)}`
  ));
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

export function shiftCues(cues: SubtitleCueV1[], offsetMs: number): SubtitleCueV1[] {
  return cues
    .map((c, i) => ({
      index: i + 1,
      startMs: Math.max(0, c.startMs - offsetMs),
      endMs: Math.max(1, c.endMs - offsetMs),
      text: c.text,
    }))
    .filter((c) => c.endMs > c.startMs);
}
