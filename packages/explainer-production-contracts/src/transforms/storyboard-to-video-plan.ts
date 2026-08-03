import type { StoryboardV1 } from '../contracts/storyboard.ts';
import type { ExplainerProductionRequestV1 } from '../contracts/explainer-production-request.ts';
import type { SceneClipBindingV1 } from '../../../project-scene-bindings/src/contracts/scene-clip-binding.ts';
import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';

export function storyboardToVideoPlan(input: {
  storyboard: StoryboardV1;
  sceneBindings: SceneClipBindingV1[];
  productionRequest: ExplainerProductionRequestV1;
}): VideoPlanV1 {
  const { storyboard, sceneBindings, productionRequest } = input;
  const bindingByScene = new Map(sceneBindings.map((b) => [b.scene.id, b]));

  const scenes = storyboard.scenes.map((scene) => {
    const binding = bindingByScene.get(scene.id);
    if (!binding) {
      throw new Error(`Missing scene binding for storyboard scene ${scene.id}`);
    }
    const entry: VideoPlanV1['scenes'][number] = {
      id: `entry_${scene.id.replace(/[^A-Za-z0-9_-]/g, '_')}`,
      name: scene.name,
      description: scene.purpose,
      binding,
      duration: scene.durationHintSeconds
        ? {
          mode: 'timeline-frames',
          timelineFrames: Math.max(1, Math.round(scene.durationHintSeconds * productionRequest.output.fps)),
        }
        : { mode: 'match-scene' },
    };
    if (scene.transitionToNext) entry.transitionToNext = scene.transitionToNext;
    if (scene.markerNote) {
      entry.marker = { note: scene.markerNote };
    }
    return entry;
  });

  return {
    schemaVersion: '1.0.0',
    id: `video-plan.${storyboard.id}`,
    name: storyboard.title,
    description: `Video plan from storyboard ${storyboard.id}`,
    output: {
      width: productionRequest.output.width,
      height: productionRequest.output.height,
      fps: productionRequest.output.fps,
      fit: 'contain',
    },
    sceneCanvasPolicy: 'require-match',
    placement: {
      mode: 'append',
      collisionPolicy: 'ripple',
    },
    markers: {
      mode: 'boundary',
      notePrefix: 'scene',
    },
    scenes,
  };
}
