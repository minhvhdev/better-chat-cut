import { EXPLAINER_PRODUCTION_SCHEMA_VERSION } from './explainer-production-request.ts';
import type { ExplainerScriptSectionV1 } from './script-segment.ts';

export type ExplainerScriptV1 = {
  schemaVersion: typeof EXPLAINER_PRODUCTION_SCHEMA_VERSION;
  id: string;
  title: string;
  logline: string;
  targetDurationSeconds: number;
  language: string;
  sections: ExplainerScriptSectionV1[];
  closing?: {
    narration: string;
    onScreenText?: string;
    claimIds?: string[];
  };
};
