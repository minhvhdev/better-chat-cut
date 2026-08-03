import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveNarrationRoot,
  subtitleArtifactDir,
  assertPathInsideRoot,
  atomicWriteJson,
} from '../../../narration-audio/src/storage/index.ts';
import type { SubtitleCueV1, SubtitleExportArtifactV1, SubtitleTimeOrigin } from '../contracts/narration-timeline-metadata.ts';
import { serializeSrt, serializeWebVtt, shiftCues, buildSubtitleCues } from './subtitle-cues.ts';
import type { NarrationWordV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';

function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function exportSubtitles(input: {
  words: NarrationWordV1[];
  pacing?: 'word' | 'phrase';
  formats?: Array<'srt' | 'vtt'>;
  timeOrigin?: SubtitleTimeOrigin;
  assemblyStartMs?: number;
  narrationPlanId: string;
  narrationPlanHash: string;
  timingHash: string;
  narrationRoot?: string;
}): { artifacts: SubtitleExportArtifactV1[]; cues: SubtitleCueV1[] } {
  const timeOrigin = input.timeOrigin ?? 'timeline';
  let cues = buildSubtitleCues({
    words: input.words,
    pacing: input.pacing ?? 'phrase',
  });
  if (timeOrigin === 'narration-assembly') {
    cues = shiftCues(cues, input.assemblyStartMs ?? 0);
  }
  const formats = input.formats ?? ['srt', 'vtt'];
  const root = resolveNarrationRoot(input.narrationRoot);
  const artifacts: SubtitleExportArtifactV1[] = [];

  for (const format of formats) {
    const text = format === 'srt' ? serializeSrt(cues) : serializeWebVtt(cues);
    const hash = contentHash(text);
    const artifactId = `subtitle_${format}_${hash.slice(0, 12)}`;
    const dir = subtitleArtifactDir(root, hash);
    assertPathInsideRoot(root, dir);
    mkdirSync(dir, { recursive: true });
    const filename = format === 'srt' ? 'captions.srt' : 'captions.vtt';
    writeFileSync(join(dir, filename), text, 'utf8');
    const meta: SubtitleExportArtifactV1 = {
      artifactId,
      format,
      narrationPlanId: input.narrationPlanId,
      narrationPlanHash: input.narrationPlanHash,
      timingHash: input.timingHash,
      timeOrigin,
      cueCount: cues.length,
      contentHash: hash,
      suggestedFilename: `${input.narrationPlanId}.${format}`,
      text,
    };
    atomicWriteJson(join(dir, 'artifact.json'), { ...meta, text: undefined });
    artifacts.push(meta);
  }

  return { artifacts, cues };
}

export * from './subtitle-cues.ts';
