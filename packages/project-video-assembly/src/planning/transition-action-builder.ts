import type { VideoPlanScheduleV1 } from '../../../video-plans/src/contracts/video-plan-schedule.ts';

export type TransitionAssemblyAction = {
  type: 'addTransition';
  id: string;
  incomingItemId: string;
  transType: string;
  durationInFrames: number;
  direction?: 'left' | 'right' | 'up' | 'down';
};

export function buildTransitionActions(input: {
  schedule: VideoPlanScheduleV1;
  entryIdToItemId: Map<string, string>;
  uid: (prefix: string) => string;
}): { actions: TransitionAssemblyAction[]; transitionIds: string[] } {
  const actions: TransitionAssemblyAction[] = [];
  const transitionIds: string[] = [];
  for (const transition of input.schedule.transitions) {
    const incomingItemId = input.entryIdToItemId.get(transition.incomingEntryId);
    if (!incomingItemId) continue;
    const id = input.uid('tr');
    transitionIds.push(id);
    actions.push({
      type: 'addTransition',
      id,
      incomingItemId,
      transType: transition.type,
      durationInFrames: Math.max(2, transition.durationInFrames),
      direction: transition.direction,
    });
  }
  return { actions, transitionIds };
}
