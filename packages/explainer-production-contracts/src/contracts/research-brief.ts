import type { SourceReferenceV1 } from './source-reference.ts';
import type { FactualClaimV1 } from './factual-claim.ts';
import { EXPLAINER_PRODUCTION_SCHEMA_VERSION } from './explainer-production-request.ts';

export type ResearchBriefV1 = {
  schemaVersion: typeof EXPLAINER_PRODUCTION_SCHEMA_VERSION;
  id: string;
  topic: string;
  summary: string;
  sources: SourceReferenceV1[];
  claims: FactualClaimV1[];
  openQuestions?: string[];
  excludedClaims?: {
    text: string;
    reason: string;
  }[];
  reviewed: boolean;
};
