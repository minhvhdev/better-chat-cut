export type NarrationSegmentV1 = {
  id: string;
  text: string;
  captionText?: string;
  speakerId?: string;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  includeInCaptions?: boolean;
  pronunciationHints?: string[];
  alignmentHints?: {
    expectedText?: string;
    expectedStartMs?: number;
    expectedEndMs?: number;
  };
};
