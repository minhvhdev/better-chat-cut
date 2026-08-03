import { AbsoluteFill } from 'remotion';
import type { SceneDocumentV1 } from '../../packages/scene-graph/src/contracts/scene-document.ts';
import { SceneContactSheetView } from '../../packages/scene-graph/src/preview/scene-contact-sheet.tsx';
import { ensureBetterChatCutMotionRuntime } from '../../packages/motion-components/src/bootstrap.ts';
import { normalizeSceneDocument } from '../../packages/scene-graph/src/schema/scene-normalization.ts';
import { defaultContactSheetFrames } from '../../packages/scene-graph/src/preview/scene-preview-input.ts';

ensureBetterChatCutMotionRuntime();

export type BetterChatCutSceneContactSheetProps = {
  scene: SceneDocumentV1;
  frames?: number[];
  columns?: number;
  cellLabelMode?: 'none' | 'frame';
  cellWidth?: number;
  width?: number;
  height?: number;
};

export function BetterChatCutSceneContactSheet(props: BetterChatCutSceneContactSheetProps) {
  const normalized = normalizeSceneDocument(props.scene);
  if (!normalized.success) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111', color: '#f88', alignItems: 'center', justifyContent: 'center' }}>
        Invalid scene
      </AbsoluteFill>
    );
  }
  const scene = normalized.scene;
  const frames = props.frames?.length ? props.frames : defaultContactSheetFrames(scene.durationInFrames);
  const columns = props.columns ?? Math.min(frames.length, 3);
  const cellWidth = props.cellWidth ?? Math.min(640, Math.floor(scene.canvas.width / 2));

  return (
    <SceneContactSheetView
      scene={scene}
      frames={frames}
      columns={columns}
      cellLabelMode={props.cellLabelMode ?? 'frame'}
      cellWidth={cellWidth}
    />
  );
}
