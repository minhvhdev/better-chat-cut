import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneRuntimeRenderer } from '../../../scene-graph/src/runtime/scene-renderer.tsx';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import { parseSceneClipBindingForRender } from './parse-binding-for-render.ts';
import { timelineFrameToSceneFrame } from '../timeline/scene-clip-frame-mapping.ts';

export type BetterChatCutTimelineSceneProps = {
  item: SceneClipTimelineItemLike;
  localFrame?: number;
  timelineFps?: number;
};

function ErrorCard({ code, message }: { code: string; message: string }) {
  return (
    <AbsoluteFill
      style={{
        background: '#1a1020',
        color: '#f8a0a0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 18,
        padding: 24,
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
      }}
    >
      {`${code}\n${message}`}
    </AbsoluteFill>
  );
}

/**
 * Renders an embedded SceneClipBindingV1 snapshot.
 * Does not read Scene Draft Store. Playback authority is the embedded scene.
 */
export function BetterChatCutTimelineScene({
  item,
  localFrame,
  timelineFps,
}: BetterChatCutTimelineSceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parsed = parseSceneClipBindingForRender(item);
  if (!parsed.binding) {
    return <ErrorCard code={parsed.errorCode ?? 'SCENE_CLIP_RENDER_FAILED'} message={parsed.errorMessage ?? 'Invalid scene binding'} />;
  }
  const binding = parsed.binding;
  const itemLocal = localFrame ?? frame;
  const sceneFrame = timelineFrameToSceneFrame({
    itemLocalFrame: itemLocal,
    itemSrcInFrame: item.srcInFrame,
    timelineFps: timelineFps ?? fps,
    sceneFps: binding.scene.fps,
    sceneDurationInFrames: binding.scene.durationInFrames,
  });

  const dw = binding.scene.canvas.width;
  const dh = binding.scene.canvas.height;

  try {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ width: dw, height: dh, position: 'relative', flexShrink: 0 }}>
          <SceneRuntimeRenderer scene={binding.scene} frame={sceneFrame} />
        </div>
      </AbsoluteFill>
    );
  } catch {
    return <ErrorCard code="SCENE_CLIP_RENDER_FAILED" message="Scene clip render failed" />;
  }
}
