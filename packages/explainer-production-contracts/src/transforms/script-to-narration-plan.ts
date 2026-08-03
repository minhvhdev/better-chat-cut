import type { ExplainerScriptV1 } from '../contracts/explainer-script.ts';
import type { StoryboardV1 } from '../contracts/storyboard.ts';
import type { ExplainerProductionRequestV1 } from '../contracts/explainer-production-request.ts';
import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import type { NarrationPlanV1 } from '../../../narration-plans/src/contracts/narration-plan.ts';
import type { NarrationSpeakerV1 } from '../../../narration-plans/src/contracts/narration-speaker.ts';
import type { NarrationSceneV1 } from '../../../narration-plans/src/contracts/narration-scene.ts';
import type { NarrationSegmentV1 } from '../../../narration-plans/src/contracts/narration-segment.ts';
import { deepCloneJson } from '../schema/serialization.ts';

export function scriptToNarrationPlan(input: {
  script: ExplainerScriptV1;
  storyboard: StoryboardV1;
  videoPlan: VideoPlanV1;
  productionRequest: ExplainerProductionRequestV1;
  speakerConfiguration: NarrationSpeakerV1[];
}): NarrationPlanV1 {
  const { script, storyboard, videoPlan, productionRequest, speakerConfiguration } = input;
  if (!speakerConfiguration.length) {
    throw new Error('Speaker configuration required for NarrationPlan');
  }

  const segmentById = new Map<string, { narration: string; onScreenText?: string; pronunciationHints?: string[] }>();
  for (const section of script.sections) {
    for (const seg of section.segments) {
      segmentById.set(seg.id, {
        narration: seg.narration,
        onScreenText: seg.onScreenText,
        pronunciationHints: seg.pronunciationHints,
      });
    }
  }

  const scenes: NarrationSceneV1[] = storyboard.scenes.map((scene, index) => {
    const videoEntry = videoPlan.scenes[index];
    const sceneEntryId = videoEntry?.id ?? `entry_${scene.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const segments: NarrationSegmentV1[] = scene.scriptSegmentIds.map((segId) => {
      const src = segmentById.get(segId);
      if (!src) {
        throw new Error(`Missing script segment ${segId} for storyboard scene ${scene.id}`);
      }
      const out: NarrationSegmentV1 = {
        id: segId,
        text: src.narration,
        speakerId: speakerConfiguration[0].id,
        includeInCaptions: true,
      };
      if (src.onScreenText) out.captionText = src.onScreenText;
      if (src.pronunciationHints?.length) out.pronunciationHints = [...src.pronunciationHints];
      return out;
    });
    return {
      sceneEntryId,
      segments,
    };
  });

  return {
    schemaVersion: '1.0.0',
    id: `narration.${script.id}`,
    name: `Narration for ${script.title}`,
    language: productionRequest.language,
    videoPlan: deepCloneJson(videoPlan),
    speakers: deepCloneJson(speakerConfiguration),
    defaults: {
      speakerId: speakerConfiguration[0].id,
      captions: {
        enabled: true,
        export: { srt: true, vtt: true },
      },
    },
    scenes,
  };
}
