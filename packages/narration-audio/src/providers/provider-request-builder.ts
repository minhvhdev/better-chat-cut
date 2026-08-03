import { sha256Hex, stableStringify } from '../../../narration-plans/src/schema/narration-serialization.ts';
import type { NarrationSynthesisRequestV1 } from '../contracts/synthesis-request.ts';
import type { NarrationAudioArtifactV1 } from '../contracts/synthesis-artifact.ts';
import { sha256Bytes } from '../storage/narration-paths.ts';

export const PROVIDER_ADAPTER_CONTRACT_VERSION = 'narration-provider-adapter.1.0.0';

export function computeNarrationSynthesisInputHash(input: {
  text: string;
  provider: string;
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
  subtitleTiming?: string;
  pronunciationHints?: string[];
  previousText?: string;
  nextText?: string;
}): string {
  return sha256Hex(stableStringify({
    ...input,
    providerAdapterContractVersion: PROVIDER_ADAPTER_CONTRACT_VERSION,
  }));
}

export function computeArtifactHash(input: {
  synthesisInputHash: string;
  audioContentHash: string;
  durationMs: number;
  codec: string;
  sampleRate?: number;
  timingDataHash: string;
  provider: string;
  voiceId: string;
  modelId?: string;
}): string {
  return sha256Hex(stableStringify(input));
}

export function computeTimingDataHash(words: { text: string; start: number; end: number }[]): string {
  return sha256Hex(stableStringify(words));
}

export function audioContentHashFromBytes(bytes: Uint8Array | Buffer): string {
  return sha256Bytes(bytes);
}

export function summarizeArtifact(artifact: NarrationAudioArtifactV1) {
  return {
    artifactId: artifact.artifactId,
    synthesisInputHash: artifact.synthesisInputHash,
    mediaSrc: artifact.mediaSrc,
    durationMs: artifact.durationMs,
    audioContentHash: artifact.audioContentHash,
    artifactHash: artifact.artifactHash,
    timingQuality: artifact.wordTiming.quality,
  };
}

export function toProviderVoiceRequest(req: NarrationSynthesisRequestV1): Record<string, unknown> {
  // Allowlisted mapping onto OpenChatCut voice request shape — no credentials.
  return {
    provider: req.provider,
    voiceId: req.voiceId,
    text: req.text,
    ...(req.modelId ? { modelId: req.modelId } : {}),
    ...(req.speed !== undefined ? { speed: req.speed } : {}),
    ...(req.pitch !== undefined ? { pitch: req.pitch } : {}),
    ...(req.volume !== undefined ? { volume: req.volume } : {}),
    ...(req.emotion ? { emotion: req.emotion } : {}),
    ...(req.emotionScale !== undefined ? { emotionScale: req.emotionScale } : {}),
    ...(req.languageCode ? { languageCode: req.languageCode } : {}),
    ...(req.languageBoost ? { languageBoost: req.languageBoost } : {}),
    ...(req.outputFormat ? { outputFormat: req.outputFormat } : {}),
    ...(req.sampleRate !== undefined ? { sampleRate: req.sampleRate } : {}),
    ...(req.subtitleTiming && req.subtitleTiming !== 'none' ? { subtitleEnable: true, subtitleType: req.subtitleTiming } : {}),
    ...(req.previousText ? { previousText: req.previousText } : {}),
    ...(req.nextText ? { nextText: req.nextText } : {}),
    ...(req.pronunciationHints?.length ? { pronunciations: req.pronunciationHints } : {}),
  };
}
