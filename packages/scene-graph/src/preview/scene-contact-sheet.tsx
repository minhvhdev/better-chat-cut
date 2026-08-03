import { AbsoluteFill, Sequence } from 'remotion';
import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import { SceneRuntimeRenderer } from '../runtime/scene-renderer.tsx';

export type SceneContactSheetProps = {
  scene: SceneDocumentV1;
  frames: number[];
  columns: number;
  cellLabelMode: 'none' | 'frame';
  cellWidth: number;
};

export function SceneContactSheetView({
  scene,
  frames,
  columns: _columns,
  cellLabelMode,
  cellWidth,
}: SceneContactSheetProps) {
  const cellHeight = Math.round(cellWidth * (scene.canvas.height / scene.canvas.width));
  const scale = cellWidth / scene.canvas.width;

  return (
    <AbsoluteFill style={{ backgroundColor: '#020617', display: 'flex', flexWrap: 'wrap' }}>
      {frames.map((frameNumber, index) => (
        <div
          key={`${frameNumber}-${index}`}
          style={{
            width: cellWidth,
            height: cellHeight,
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid #1e293b',
            boxSizing: 'border-box',
          }}
        >
          <Sequence from={0} durationInFrames={1} layout="none">
            <div
              style={{
                width: scene.canvas.width,
                height: scene.canvas.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <SceneRuntimeRenderer scene={scene} frame={frameNumber} />
            </div>
          </Sequence>
          {cellLabelMode === 'frame' ? (
            <div style={{ position: 'absolute', left: 6, bottom: 4, color: '#94a3b8', fontSize: 12 }}>
              f{frameNumber}
            </div>
          ) : null}
        </div>
      ))}
    </AbsoluteFill>
  );
}
