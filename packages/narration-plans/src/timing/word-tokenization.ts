/** Unicode-aware tokenization for estimated word timing and alignment. */

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;
const LATIN_WORD_RE = /[\p{L}\p{N}\u00C0-\u024F\u1E00-\u1EFF]+|[^\s\p{L}\p{N}]/gu;

export type TimingToken = {
  text: string;
  weight: number;
  isPunctuation: boolean;
  isSentenceEnd: boolean;
};

export function tokenizeForTiming(text: string): TimingToken[] {
  const trimmed = text.normalize('NFC').trim();
  if (!trimmed) return [];

  if (CJK_RE.test(trimmed) && !/[\p{Script=Latin}]/u.test(trimmed)) {
    // Character / short-run strategy for CJK-dominant text
    const tokens: TimingToken[] = [];
    for (const ch of trimmed) {
      if (/\s/u.test(ch)) continue;
      const isPunct = /[。！？!?．，、；;：:\u3001\u3002]/.test(ch);
      tokens.push({
        text: ch,
        weight: isPunct ? 0.35 : 1,
        isPunctuation: isPunct,
        isSentenceEnd: /[。！？!?]/.test(ch),
      });
    }
    return tokens.filter((t) => t.text.length > 0);
  }

  const matches = trimmed.match(LATIN_WORD_RE) ?? [];
  return matches.map((textToken) => {
    const isPunct = /^[^\p{L}\p{N}]+$/u.test(textToken);
    const isSentenceEnd = /^[.!?…]+$/.test(textToken) || /[.!?…]$/.test(textToken);
    const visible = [...textToken].length;
    let weight = Math.max(1, visible);
    if (isPunct) {
      weight = /[,;:]/.test(textToken) ? 0.6 : isSentenceEnd ? 0.9 : 0.4;
    }
    return {
      text: textToken,
      weight,
      isPunctuation: isPunct,
      isSentenceEnd,
    };
  }).filter((t) => t.text.length > 0);
}
