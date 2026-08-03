import type { VideoPlanV1 } from './video-plan.ts';
import type { VideoPlanDiagnostic } from './video-plan-errors.ts';
import type { VideoPlanScheduleV1 } from './video-plan-schedule.ts';

export type VideoPlanValidationResultV1 = {
  valid: boolean;
  normalizedPlan?: VideoPlanV1;
  planHash?: string;
  videoPlanRuntimeRevision: string;
  schedule?: VideoPlanScheduleV1;
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};

export type VideoPlanNormalizationResult = {
  ok: boolean;
  plan?: VideoPlanV1;
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};
