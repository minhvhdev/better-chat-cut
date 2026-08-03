import type { VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';
import type { VideoPlanAssemblyStatus } from './assembly-metadata.ts';

export type VideoPlanSceneAssemblyCheckV1 = {
  entryId: string;
  status: 'ok' | 'missing' | 'duplicate' | 'drifted' | 'invalid';
  itemIds: string[];
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};

export type VideoPlanTransitionAssemblyCheckV1 = {
  outgoingEntryId: string;
  incomingEntryId: string;
  status: 'ok' | 'missing' | 'changed' | 'invalid';
  transitionIds: string[];
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};

export type VideoPlanMarkerAssemblyCheckV1 = {
  sceneEntryId: string;
  kind: 'boundary' | 'range';
  status: 'ok' | 'missing' | 'changed' | 'invalid';
  markerIds: string[];
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};

export type VideoPlanAssemblyInspectionV1 = {
  status: VideoPlanAssemblyStatus;
  planId: string;
  planHash: string;
  timelineId: string;
  assemblyId?: string;
  expectedSceneCount: number;
  foundSceneCount: number;
  expectedTransitionCount: number;
  foundTransitionCount: number;
  expectedMarkerCount: number;
  foundMarkerCount: number;
  sceneChecks: VideoPlanSceneAssemblyCheckV1[];
  transitionChecks: VideoPlanTransitionAssemblyCheckV1[];
  markerChecks: VideoPlanMarkerAssemblyCheckV1[];
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
};
