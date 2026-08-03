import type { VideoPlanV1 } from '../contracts/video-plan.ts';
import type { VideoPlanScheduleV1 } from '../contracts/video-plan-schedule.ts';
import type { VideoPlanValidationResultV1 } from '../contracts/video-plan-validation.ts';
import { validateVideoPlan } from '../schema/video-plan-validator.ts';
import { createVideoPlanSchedule } from '../schedule/sequence-scheduler.ts';
import { VideoPlanError } from '../contracts/video-plan-errors.ts';

export interface VideoPlanService {
  validate(input: unknown): VideoPlanValidationResultV1;
  createSchedule(plan: VideoPlanV1): VideoPlanScheduleV1;
}

export function createVideoPlanService(): VideoPlanService {
  return {
    validate(input: unknown): VideoPlanValidationResultV1 {
      return validateVideoPlan(input, { includeSchedule: true });
    },
    createSchedule(plan: VideoPlanV1): VideoPlanScheduleV1 {
      const result = createVideoPlanSchedule(plan);
      if (result.errors.length > 0) {
        throw new VideoPlanError(result.errors[0]!.code, result.errors[0]!.message, {
          diagnostics: result.errors,
          recovery: result.errors[0]!.recovery,
        });
      }
      return result.schedule;
    },
  };
}
