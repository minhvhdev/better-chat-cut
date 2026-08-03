export type VoiceoverSourceV1 =
  | { type: 'media-asset'; mediaAssetId: string }
  | { type: 'timeline-item'; itemId: string };

export type NarrationAlignmentOverrideV1 = {
  segmentId: string;
  startWordIndex?: number;
  endWordIndex?: number;
  startMs?: number;
  endMs?: number;
};

export type NarrationAlignmentConfidence = 'high' | 'medium' | 'low' | 'failed';

export type AlignmentDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  segmentId?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export function alignmentDiagnostic(
  severity: AlignmentDiagnostic['severity'],
  code: string,
  message: string,
  extra: Omit<AlignmentDiagnostic, 'severity' | 'code' | 'message'> = {},
): AlignmentDiagnostic {
  return { severity, code, message, ...extra };
}

export type VoiceoverAlignmentResultV1 = {
  valid: boolean;
  narrationPlanId: string;
  narrationPlanHash: string;
  voiceover: {
    source: VoiceoverSourceV1;
    sourceRevision: string;
    durationMs: number;
    transcriptHash?: string;
  };
  segments: {
    segmentId: string;
    sceneEntryId: string;
    startMs?: number;
    endMs?: number;
    startWordIndex?: number;
    endWordIndex?: number;
    confidence: NarrationAlignmentConfidence;
    score: number;
    matchedText?: string;
    errors: AlignmentDiagnostic[];
    warnings: AlignmentDiagnostic[];
  }[];
  timingSnapshot?: import('../../../narration-plans/src/contracts/narration-timing.ts').NarrationTimingSnapshotV1;
  errors: AlignmentDiagnostic[];
  warnings: AlignmentDiagnostic[];
};
