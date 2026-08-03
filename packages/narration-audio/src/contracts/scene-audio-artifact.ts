import type { NarrationWordV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';

export type NarrationSceneAudioArtifactV1 = {
  sceneEntryId: string;
  mediaSrc: string;
  durationMs: number;
  sourceRevision: string;
  audioContentHash: string;
  segmentArtifacts: string[];
  words: NarrationWordV1[];
  wordTimingQuality: 'provider-word' | 'provider-sentence' | 'estimated-word' | 'mixed';
  artifactHash: string;
};
