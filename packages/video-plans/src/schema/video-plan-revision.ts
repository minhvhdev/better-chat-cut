import { VIDEO_PLAN_RUNTIME_REVISION } from '../contracts/video-plan-policy.ts';

export function computeVideoPlanRuntimeRevision(): string {
  return VIDEO_PLAN_RUNTIME_REVISION;
}
