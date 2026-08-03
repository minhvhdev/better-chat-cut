import type { VideoPlanValidationResultV1 } from '../contracts/video-plan-validation.ts';
import { normalizeVideoPlan } from './video-plan-normalization.ts';
import { computeVideoPlanHash } from './video-plan-hash.ts';
import { computeVideoPlanRuntimeRevision } from './video-plan-revision.ts';
import { createVideoPlanSchedule } from '../schedule/sequence-scheduler.ts';
import { validateVideoPlanSchedule } from '../schedule/schedule-validation.ts';

export function validateVideoPlan(
  input: unknown,
  options: { includeSchedule?: boolean } = {},
): VideoPlanValidationResultV1 {
  const includeSchedule = options.includeSchedule !== false;
  const revision = computeVideoPlanRuntimeRevision();
  const normalized = normalizeVideoPlan(input);
  if (!normalized.ok || !normalized.plan) {
    return {
      valid: false,
      videoPlanRuntimeRevision: revision,
      errors: normalized.errors,
      warnings: normalized.warnings,
    };
  }

  const planHash = computeVideoPlanHash(normalized.plan);
  const scheduleResult = createVideoPlanSchedule(normalized.plan);
  const scheduleErrors = [
    ...scheduleResult.errors,
    ...validateVideoPlanSchedule(scheduleResult.schedule),
  ];
  const errors = [...normalized.errors, ...scheduleErrors];
  const warnings = [...normalized.warnings, ...scheduleResult.warnings];
  const valid = errors.length === 0;

  return {
    valid,
    normalizedPlan: normalized.plan,
    planHash: valid ? planHash : undefined,
    videoPlanRuntimeRevision: revision,
    schedule: includeSchedule && valid ? scheduleResult.schedule : (includeSchedule ? scheduleResult.schedule : undefined),
    errors,
    warnings,
  };
}
