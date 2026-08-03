import type { NarrationTtsProvider, SubtitleTimingMode } from './narration-policy.ts';

export type NarrationTemporaryVoiceV1 = {
  provider: NarrationTtsProvider;
  voiceId: string;
  modelId?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  emotionScale?: number;
  languageCode?: string;
  languageBoost?: string;
  outputFormat?: string;
  sampleRate?: number;
  subtitleTiming?: SubtitleTimingMode;
};

export type NarrationSpeakerV1 = {
  id: string;
  name?: string;
  temporaryVoice: NarrationTemporaryVoiceV1;
};
