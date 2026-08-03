export const BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY = '__betterChatCutVideoPlan';

export const VIDEO_PLAN_ASSEMBLY_METADATA_SCHEMA_VERSION = '1.0.0' as const;

export type VideoPlanClipMetadataV1 = {
  schemaVersion: '1.0.0';
  assemblyId: string;
  planId: string;
  planHash: string;
  sceneEntryId: string;
  sequenceIndex: number;
  assemblyRequestId: string;
  assemblyInputHash: string;
};

export type VideoPlanAssemblyStatus =
  | 'not-assembled'
  | 'complete'
  | 'drifted'
  | 'incomplete'
  | 'duplicate'
  | 'invalid';
