export const PROVIDER_CAPABILITIES = {
  elevenlabs: { wordTiming: false, sentenceTiming: false, context: true },
  doubao: { wordTiming: true, sentenceTiming: true, context: true },
  minimax: { wordTiming: true, sentenceTiming: true, context: false },
} as const;

export type NarrationTtsProviderResult = {
  audio: Uint8Array;
  durationMs?: number;
  subtitle?: unknown;
  codec?: string;
  sampleRate?: number;
};

export type NarrationTtsProviderFn = (request: Record<string, unknown>) => Promise<NarrationTtsProviderResult>;

export {
  computeNarrationSynthesisInputHash,
  computeArtifactHash,
  computeTimingDataHash,
  audioContentHashFromBytes,
  summarizeArtifact,
  toProviderVoiceRequest,
  PROVIDER_ADAPTER_CONTRACT_VERSION,
} from './provider-request-builder.ts';

export { parseProviderSubtitleTiming } from './provider-subtitle-parser.ts';
