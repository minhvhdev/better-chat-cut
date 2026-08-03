import { isBetterChatCutSceneClip } from '../../../project-scene-bindings/src/schema/scene-clip-props-validator.ts';
import { readVideoPlanClipMetadata } from '../planning/idempotency.ts';
import { BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY } from '../contracts/assembly-metadata.ts';

export function discoverVideoPlanClips(timeline: {
  items: Array<{
    id: string;
    kind?: string;
    templateId?: string;
    props?: Record<string, unknown>;
    track: string;
    startFrame: number;
    durationInFrames: number;
  }>;
}, planId?: string, planHash?: string) {
  return timeline.items.filter((item) => {
    if (!isBetterChatCutSceneClip(item as never)) return false;
    if (!item.props || !(BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY in item.props)) return false;
    const meta = readVideoPlanClipMetadata(item);
    if (!meta) return false;
    if (planId && meta.planId !== planId) return false;
    if (planHash && meta.planHash !== planHash) return false;
    return true;
  });
}
