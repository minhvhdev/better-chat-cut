import { AbsoluteFill, Freeze } from 'remotion';
import { TimelineComposition } from '../../src/editor/TimelineComposition';
import type { TimelineState } from '../../src/editor/types';

export type AssemblyContactSheetProps = {
  state: TimelineState;
  frames: number[];
  columns: number;
  cellWidth: number;
  cellHeight: number;
};

export function BetterChatCutAssemblyContactSheet({
  state,
  frames,
  columns,
  cellWidth,
  cellHeight,
}: AssemblyContactSheetProps) {
  const scale = cellWidth / Math.max(1, state.width);
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
          <Freeze frame={frameNumber}>
            <div
              style={{
                width: state.width,
                height: state.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <TimelineComposition state={state} transparent={false} />
            </div>
          </Freeze>
        </div>
      ))}
    </AbsoluteFill>
  );
}
