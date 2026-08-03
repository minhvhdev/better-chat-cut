# VideoPlan scheduling

Timeline timebase is **integer frames** at `plan.output.fps`.

## Scene duration

Reuse M4B:

`ceil(sceneDurationInFrames / sceneFps * timelineFps)`, minimum 1.

Fixed `timeline-frames` overrides clip length only; SceneDocument duration is unchanged.

## Gaps

`gapAfterFrames` advances the schedule cursor after each scene. Trailing gaps are included in `totalDurationInFrames` and warn.

## Transitions

Timeline transitions do **not** reduce total duration. Cut frame = incoming absolute/relative start. Requires adjacency (`gapAfterFrames = 0`).

## Determinism

Same normalized plan + runtime revision → same schedule, hashes, marker notes, and sample frame sets. No `Date.now` / `Math.random` in planning.
