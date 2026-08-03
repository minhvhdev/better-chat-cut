export type ExplainerScriptSegmentV1 = {
  id: string;
  narration: string;
  onScreenText?: string;
  claimIds: string[];
  emphasis?: string[];
  pronunciationHints?: string[];
  targetDurationSeconds?: number;
};

export type ExplainerScriptSectionV1 = {
  id: string;
  title?: string;
  purpose: string;
  segments: ExplainerScriptSegmentV1[];
};
