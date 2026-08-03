import { AbsoluteFill } from 'remotion';
import type { SceneDocumentV1 } from '../../packages/scene-graph/src/contracts/scene-document.ts';
import { SceneRuntimeRenderer } from '../../packages/scene-graph/src/runtime/scene-renderer.tsx';
import { ensureBetterChatCutMotionRuntime } from '../../packages/motion-components/src/bootstrap.ts';
import { normalizeSceneDocument } from '../../packages/scene-graph/src/schema/scene-normalization.ts';

ensureBetterChatCutMotionRuntime();

export type BetterChatCutSceneStillProps = {
  scene: SceneDocumentV1;
  frame: number;
  width?: number;
  height?: number;
};

export function BetterChatCutSceneStill(props: BetterChatCutSceneStillProps) {
  const normalized = normalizeSceneDocument(props.scene);
  if (!normalized.success) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111', color: '#f88', alignItems: 'center', justifyContent: 'center' }}>
        Invalid scene: {normalized.errors.map((e) => e.message).join('; ')}
      </AbsoluteFill>
    );
  }
  const scene = normalized.scene;
  const scaleX = (props.width ?? scene.canvas.width) / scene.canvas.width;
  const scaleY = (props.height ?? scene.canvas.height) / scene.canvas.height;
  const scale = Math.min(scaleX, scaleY);

  return (
    <AbsoluteFill style={{ backgroundColor: scene.canvas.backgroundColor }}>
      <div
        style={{
          width: scene.canvas.width,
          height: scene.canvas.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <SceneRuntimeRenderer scene={scene} frame={props.frame} />
      </div>
    </AbsoluteFill>
  );
}
