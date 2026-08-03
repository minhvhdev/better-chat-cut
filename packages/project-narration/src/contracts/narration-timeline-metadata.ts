export const BETTER_CHAT_CUT_NARRATION_PROPS_KEY = '__betterChatCutNarration';

export type NarrationTimelineMetadataV1 = {
  schemaVersion: '1.0.0';
  narrationAssemblyId: string;
  narrationPlanId: string;
  narrationPlanHash: string;
  timingHash: string;
  timedVideoPlanHash: string;
  sourceType: 'temporary-tts' | 'voiceover';
  sceneEntryIds: string[];
  segmentIds: string[];
  artifactIds?: string[];
  applyRequestId: string;
  applyInputHash: string;
};

export type NarrationTimingConflictPolicy = 'require-clear' | 'ripple-after-assembly';

export type NarrationTimelineStatus =
  | 'not-applied'
  | 'complete'
  | 'drifted'
  | 'incomplete'
  | 'duplicate'
  | 'invalid';

export type SubtitleTimeOrigin = 'timeline' | 'narration-assembly';

export type SubtitleCueV1 = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type SubtitleExportArtifactV1 = {
  artifactId: string;
  format: 'srt' | 'vtt';
  narrationPlanId: string;
  narrationPlanHash: string;
  timingHash: string;
  timeOrigin: SubtitleTimeOrigin;
  cueCount: number;
  contentHash: string;
  suggestedFilename: string;
  text?: string;
  downloadUrl?: string;
};
