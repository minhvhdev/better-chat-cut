import type { NarrationPlanV1 } from '../../../narration-plans/src/contracts/narration-plan.ts';
import type { NarrationAudioArtifactV1 } from '../contracts/synthesis-artifact.ts';
import type { NarrationSceneAudioArtifactV1 } from '../contracts/scene-audio-artifact.ts';
import { sha256Hex, stableStringify } from '../../../narration-plans/src/schema/narration-serialization.ts';
import {
  concatWavPcm,
  encodeSilenceWav,
  probeWavDurationMs,
} from './audio-duration.ts';
import {
  assertPathInsideRoot,
  atomicWriteJson,
  mediaSrcForHash,
  resolveNarrationRoot,
  sceneAudioArtifactPath,
  sha256Bytes,
} from '../storage/index.ts';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function buildSceneAudioArtifact(input: {
  narrationPlan: NarrationPlanV1;
  narrationPlanHash: string;
  sceneEntryId: string;
  segmentArtifacts: NarrationAudioArtifactV1[];
  audioBytesByContentHash: Map<string, Buffer>;
  narrationRoot?: string;
}): NarrationSceneAudioArtifactV1 {
  const plan = input.narrationPlan;
  const scene = plan.scenes.find((s) => s.sceneEntryId === input.sceneEntryId);
  if (!scene) throw new Error(`Unknown scene ${input.sceneEntryId}`);

  const leadInMs = scene.leadInMs ?? plan.defaults?.leadInMs ?? 250;
  const tailOutMs = scene.tailOutMs ?? plan.defaults?.tailOutMs ?? 350;
  const sampleRate = input.segmentArtifacts[0]?.sampleRate ?? 24000;

  const parts: Buffer[] = [encodeSilenceWav(leadInMs, sampleRate)];
  const words = [];
  const qualities = new Set<string>();
  let cursor = leadInMs;

  for (const seg of scene.segments) {
    const art = input.segmentArtifacts.find((a) => a.segmentId === seg.id);
    if (!art) continue;
    const pauseBefore = seg.pauseBeforeMs ?? 0;
    const pauseAfter = seg.pauseAfterMs ?? plan.defaults?.pauseBetweenSegmentsMs ?? 120;
    if (pauseBefore > 0) {
      parts.push(encodeSilenceWav(pauseBefore, sampleRate));
      cursor += pauseBefore;
    }
    const wav = input.audioBytesByContentHash.get(art.audioContentHash);
    if (!wav) throw new Error(`Missing bytes for segment ${seg.id}`);
    parts.push(wav);
    for (const w of art.wordTiming.words) {
      words.push({
        text: w.text,
        start: cursor + w.start,
        end: cursor + w.end,
        speaker: w.speaker,
      });
    }
    qualities.add(art.wordTiming.quality);
    cursor += art.durationMs;
    if (pauseAfter > 0) {
      parts.push(encodeSilenceWav(pauseAfter, sampleRate));
      cursor += pauseAfter;
    }
  }
  parts.push(encodeSilenceWav(tailOutMs, sampleRate));
  cursor += tailOutMs;

  const wav = concatWavPcm(parts);
  const durationMs = probeWavDurationMs(wav);
  const audioContentHash = sha256Bytes(wav);
  const mediaSrc = mediaSrcForHash(audioContentHash);
  let wordTimingQuality: NarrationSceneAudioArtifactV1['wordTimingQuality'] = 'estimated-word';
  if (qualities.size === 1) wordTimingQuality = [...qualities][0] as NarrationSceneAudioArtifactV1['wordTimingQuality'];
  else if (qualities.size > 1) wordTimingQuality = 'mixed';

  const artifact: NarrationSceneAudioArtifactV1 = {
    sceneEntryId: input.sceneEntryId,
    mediaSrc,
    durationMs,
    sourceRevision: audioContentHash.slice(0, 16),
    audioContentHash,
    segmentArtifacts: input.segmentArtifacts.map((a) => a.artifactId),
    words,
    wordTimingQuality,
    artifactHash: sha256Hex(stableStringify({
      sceneEntryId: input.sceneEntryId,
      audioContentHash,
      durationMs,
      segmentArtifacts: input.segmentArtifacts.map((a) => a.artifactHash),
      words,
      wordTimingQuality,
    })),
  };

  const root = resolveNarrationRoot(input.narrationRoot);
  const metaPath = sceneAudioArtifactPath(root, input.narrationPlanHash, input.sceneEntryId, artifact.artifactHash);
  assertPathInsideRoot(root, metaPath);
  atomicWriteJson(metaPath, artifact);
  const bytesPath = join(dirname(metaPath), 'audio.wav');
  writeFileSync(bytesPath, wav);
  input.audioBytesByContentHash.set(audioContentHash, wav);

  return artifact;
}

export function readSceneAudioBytes(root: string, planHash: string, sceneEntryId: string, artifactHash: string): Buffer | null {
  const metaPath = sceneAudioArtifactPath(root, planHash, sceneEntryId, artifactHash);
  const bytesPath = join(dirname(metaPath), 'audio.wav');
  if (!existsSync(bytesPath)) return null;
  return readFileSync(bytesPath);
}
