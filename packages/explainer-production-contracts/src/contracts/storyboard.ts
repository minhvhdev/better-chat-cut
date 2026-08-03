import { EXPLAINER_PRODUCTION_SCHEMA_VERSION } from './explainer-production-request.ts';
import type { StoryboardSceneV1 } from './storyboard-scene.ts';

export type StoryboardV1 = {
  schemaVersion: typeof EXPLAINER_PRODUCTION_SCHEMA_VERSION;
  id: string;
  title: string;
  output: {
    width: number;
    height: number;
    fps: number;
  };
  scenes: StoryboardSceneV1[];
};
