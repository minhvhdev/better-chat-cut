import type { ExplainerProductionPolicyV1 } from './production-policy.ts';

export const EXPLAINER_PRODUCTION_SCHEMA_VERSION = '1.0.0' as const;

export const PRODUCTION_REQUEST_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export const PRODUCTION_REQUEST_LIMITS = {
  MAX_PRODUCTION_REQUEST_SERIALIZED_BYTES: 2 * 1024 * 1024,
  MAX_TOPIC_LENGTH: 500,
  MAX_OBJECTIVE_LENGTH: 5000,
  MAX_AUDIENCE_DESCRIPTION_LENGTH: 5000,
  MAX_STYLE_DESCRIPTION_LENGTH: 5000,
  MIN_TARGET_DURATION_SECONDS: 5,
  MAX_TARGET_DURATION_SECONDS: 7200,
} as const;

export type ExplainerRenderProfileId =
  | 'youtube-1080p-h264'
  | 'youtube-1440p-h264'
  | 'youtube-2160p-h264'
  | 'preview-720p-h264';

export const EXPLAINER_RENDER_PROFILE_IDS: ExplainerRenderProfileId[] = [
  'youtube-1080p-h264',
  'youtube-1440p-h264',
  'youtube-2160p-h264',
  'preview-720p-h264',
];

export type ExplainerProductionRequestV1 = {
  schemaVersion: typeof EXPLAINER_PRODUCTION_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  topic: string;
  objective: string;
  audience: {
    description: string;
    assumedKnowledge?: string[];
    avoidAssumptions?: string[];
  };
  language: string;
  duration: {
    targetSeconds: number;
    minimumSeconds?: number;
    maximumSeconds?: number;
  };
  output: {
    width: number;
    height: number;
    fps: number;
    renderProfile: ExplainerRenderProfileId;
  };
  style: {
    visualStyle: string;
    tone: string;
    pacing: 'slow' | 'balanced' | 'fast';
    complexity: 'introductory' | 'intermediate' | 'advanced';
    preferredTheme?: {
      id: string;
      version: string;
    };
  };
  factualPolicy: {
    requireSources: boolean;
    minimumSourcesPerClaim?: number;
    allowUnverifiedOpinion?: boolean;
  };
  project: {
    mode: 'existing-target';
    expectedProjectId?: string;
  };
  workflow?: Partial<ExplainerProductionPolicyV1>;
};
