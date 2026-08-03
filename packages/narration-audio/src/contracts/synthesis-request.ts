import type { NarrationTtsProvider } from '../../../narration-plans/src/contracts/narration-policy.ts';

export type NarrationSynthesisRequestV1 = {
  requestId: string;
  narrationPlanId: string;
  narrationPlanHash: string;
  sceneEntryId: string;
  segmentId: string;
  text: string;
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
  subtitleTiming?: 'none' | 'sentence' | 'word';
  pronunciationHints?: string[];
  previousText?: string;
  nextText?: string;
  synthesisInputHash: string;
};
