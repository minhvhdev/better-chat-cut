/** Deterministic QA frame selection — no Math.random / Date.now. */
export function selectProductionQaFrames(input: {
  startFrame: number;
  endFrame: number;
  timelineFps: number;
  sceneBoundaries?: number[];
  transitionFrames?: number[];
  captionFrames?: number[];
  narrationFrames?: number[];
  maximumFrames: number;
}): number[] {
  const start = Math.max(0, Math.floor(input.startFrame));
  const end = Math.max(start + 1, Math.floor(input.endFrame));
  const last = end - 1;
  const duration = end - start;
  const reasons = new Map<number, string[]>();

  const add = (frame: number, reason: string) => {
    if (!Number.isInteger(frame) || frame < start || frame > last) return;
    const list = reasons.get(frame) ?? [];
    if (!list.includes(reason)) list.push(reason);
    reasons.set(frame, list);
  };

  add(start, 'first');
  add(last, 'last');
  add(start + Math.floor(duration * 0.25), 'q25');
  add(start + Math.floor(duration * 0.5), 'q50');
  add(start + Math.floor(duration * 0.75), 'q75');

  for (const f of input.sceneBoundaries ?? []) add(f, 'scene-boundary');
  for (const f of input.transitionFrames ?? []) add(f, 'transition');
  for (const f of input.captionFrames ?? []) add(f, 'caption');
  for (const f of input.narrationFrames ?? []) add(f, 'narration');

  let frames = [...reasons.keys()].sort((a, b) => a - b);
  if (frames.length <= input.maximumFrames) return frames;

  // Deterministic stratified keep: always first/last, then evenly sample remaining.
  const keep = new Set<number>([start, last]);
  const remaining = frames.filter((f) => f !== start && f !== last);
  const slots = Math.max(0, input.maximumFrames - keep.size);
  if (slots > 0 && remaining.length) {
    for (let i = 0; i < slots; i += 1) {
      const idx = Math.floor((i * (remaining.length - 1)) / Math.max(1, slots - 1));
      keep.add(remaining[Math.min(remaining.length - 1, idx)]!);
    }
  }
  frames = [...keep].sort((a, b) => a - b).slice(0, input.maximumFrames);
  return frames;
}
