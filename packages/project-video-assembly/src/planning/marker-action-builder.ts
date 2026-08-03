import type { VideoPlanScheduleV1 } from '../../../video-plans/src/contracts/video-plan-schedule.ts';
import type { VideoPlanMarkerColor } from '../../../video-plans/src/contracts/video-plan-policy.ts';

export type MarkerAssemblyAction = {
  type: 'addMarker';
  marker: {
    id: string;
    scope: 'project';
    fromFrame: number;
    durationFrames: number;
    note: string;
    color: VideoPlanMarkerColor;
  };
};

export function buildMarkerActions(input: {
  schedule: VideoPlanScheduleV1;
  absoluteStartFrame: number;
  uid: (prefix: string) => string;
}): { actions: MarkerAssemblyAction[]; markerIds: string[] } {
  const actions: MarkerAssemblyAction[] = [];
  const markerIds: string[] = [];
  for (const marker of input.schedule.markers) {
    const id = input.uid('mk');
    markerIds.push(id);
    actions.push({
      type: 'addMarker',
      marker: {
        id,
        scope: 'project',
        fromFrame: input.absoluteStartFrame + marker.relativeFromFrame,
        durationFrames: marker.durationFrames,
        note: marker.note,
        color: marker.color as VideoPlanMarkerColor,
      },
    });
  }
  return { actions, markerIds };
}
