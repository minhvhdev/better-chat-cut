import assert from 'node:assert/strict';
import { sampleVideoPlanBinding } from './src/fixtures/sample-binding.ts';
import {
  planVideoPlanAssembly,
  createVideoPlanRenderValidator,
  type AssemblyTimelineLike,
} from './src/index.ts';
import {
  renderAssemblyContactSheet,
  renderTimelineStill,
  shouldSkipAssemblyRender,
} from './src/rendering/assembly-contact-sheet.ts';
import { makeDraft } from '../../src/editor/store.ts';
import { emptyProjectDoc } from '../../src/agent/tools/project-tools.ts';

/** Real TimelineComposition still + contact-sheet smoke. Set BCC_SKIP_ASSEMBLY_RENDER=1 to skip. */

const live = emptyProjectDoc({ fps: 30, width: 1280, height: 720 });
const draft = makeDraft(live);
const plan = {
  schemaVersion: '1.0.0' as const,
  id: 'video-plan.render-verify',
  name: 'Render verify',
  output: { width: 1280, height: 720, fps: 30, fit: 'contain' as const },
  placement: { mode: 'append' as const },
  markers: { mode: 'boundary' as const },
  scenes: [
    {
      id: 'intro',
      binding: await sampleVideoPlanBinding('scene.intro'),
      transitionToNext: { mode: 'timeline-transition' as const, type: 'cross-dissolve' as const, durationInFrames: 10 },
    },
    { id: 'body', binding: await sampleVideoPlanBinding('scene.body'), duration: { mode: 'timeline-frames' as const, timelineFrames: 40 } },
    { id: 'outro', binding: await sampleVideoPlanBinding('scene.outro') },
  ],
};

function asTimeline(): AssemblyTimelineLike {
  const tl = draft.getDoc().timelines[0]!;
  return {
    id: tl.id,
    name: tl.name,
    width: tl.width,
    height: tl.height,
    fps: tl.fps,
    fit: tl.fit,
    items: draft.getState().items,
    transitions: draft.getState().transitions,
    markers: draft.getState().markers,
    tracks: draft.getState().tracks as AssemblyTimelineLike['tracks'],
  };
}

let seq = 0;
const planned = planVideoPlanAssembly({
  plan,
  timeline: asTimeline(),
  requestId: 'render-asm-1',
  uid: (prefix) => `${prefix}_${++seq}`,
});
draft.commands.batch(planned.actions as never, planned.result.actionSummary);

const validator = createVideoPlanRenderValidator({
  shouldSkip: shouldSkipAssemblyRender,
  renderStill: renderTimelineStill,
  renderContactSheet: renderAssemblyContactSheet,
});
const meta = await validator.validate({ plan, timeline: asTimeline(), mode: 'metadata-only' });
assert.equal(meta.assemblyStatus, 'complete', JSON.stringify(meta.errors));
assert.equal(meta.valid, true, JSON.stringify(meta.errors));

if (shouldSkipAssemblyRender()) {
  console.log('project-video-assembly.render.verify: ok (render skipped)');
} else {
  const report = await validator.validate({
    plan,
    timeline: asTimeline(),
    mode: 'sample-frames',
    columns: 3,
  });
  assert.ok(report.renderedSamples.some((sample) => sample.rendered), JSON.stringify(report.errors));
  assert.ok(report.contactSheet && report.contactSheet.byteLength > 0, 'contact sheet missing');
  console.log('project-video-assembly.render.verify: ok');
}
