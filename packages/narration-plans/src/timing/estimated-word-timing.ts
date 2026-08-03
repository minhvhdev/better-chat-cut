import type { NarrationWordV1 } from '../contracts/narration-timing.ts';
import { tokenizeForTiming } from './word-tokenization.ts';

/**
 * Deterministic estimated word timings across a known duration.
 * Pure — no network, randomness, or wall clock.
 */
export function estimateWordTimings(input: {
  text: string;
  durationMs: number;
  language: string;
}): NarrationWordV1[] {
  const durationMs = Math.max(1, Math.floor(input.durationMs));
  const tokens = tokenizeForTiming(input.text);
  if (tokens.length === 0) {
    return [{ text: input.text.trim() || '…', start: 0, end: durationMs }];
  }

  const totalWeight = tokens.reduce((sum, t) => sum + Math.max(0.25, t.weight), 0);
  const words: NarrationWordV1[] = [];
  let cursor = 0;
  tokens.forEach((token, index) => {
    const share = Math.max(0.25, token.weight) / totalWeight;
    let span = Math.max(1, Math.round(share * durationMs));
    if (index === tokens.length - 1) {
      span = Math.max(1, durationMs - cursor);
    }
    let start = cursor;
    let end = Math.min(durationMs, start + span);
    if (end <= start) end = Math.min(durationMs, start + 1);
    if (index === tokens.length - 1) end = durationMs;
    // Skip pure punctuation as standalone caption words when possible — keep but short
    words.push({ text: token.text, start, end });
    cursor = end;
  });

  // Enforce monotonic non-overlap and last end <= duration
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i]!;
    if (i > 0) {
      const prev = words[i - 1]!;
      if (w.start < prev.end) w.start = prev.end;
    }
    if (w.end <= w.start) w.end = Math.min(durationMs, w.start + 1);
    if (w.end > durationMs) w.end = durationMs;
    if (w.start >= durationMs) {
      w.start = Math.max(0, durationMs - 1);
      w.end = durationMs;
    }
  }
  if (words.length > 0) words[words.length - 1]!.end = durationMs;
  return words;
}
