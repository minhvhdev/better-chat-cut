import type { NarrationWordV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';
import type { NarrationTtsProvider } from '../../../narration-plans/src/contracts/narration-policy.ts';

export type NarrationAudioArtifactV1 = {
  schemaVersion: '1.0.0';
  artifactId: string;
  narrationPlanId: string;
  narrationPlanHash: string;
  sceneEntryId: string;
  segmentId: string;
  synthesisInputHash: string;
  provider: NarrationTtsProvider;
  voiceId: string;
  modelId?: string;
  mediaSrc: string;
  codec: string;
  sampleRate?: number;
  durationMs: number;
  audioContentHash: string;
  sourceRevision: string;
  wordTiming: {
    quality: 'provider-word' | 'provider-sentence' | 'estimated-word' | 'segment-only';
    words: NarrationWordV1[];
  };
  artifactHash: string;
  createdAt: string;
};

export type NarrationAudioArtifactSummaryV1 = {
  artifactId: string;
  synthesisInputHash: string;
  mediaSrc: string;
  durationMs: number;
  audioContentHash: string;
  artifactHash: string;
  timingQuality: string;
};
