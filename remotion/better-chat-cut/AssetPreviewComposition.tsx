import { AbsoluteFill, Sequence } from 'remotion';
import { MotionAssetRenderer } from '../../packages/motion-components/src/runtime/MotionAssetRenderer.tsx';
import type { MotionAssetPreviewInput } from '../../packages/motion-components/src/contracts/motion-types.ts';
import { getMotionComponent } from '../../packages/motion-components/src/runtime/registry.ts';
import { ensureBetterChatCutMotionRuntime } from '../../packages/motion-components/src/bootstrap.ts';

ensureBetterChatCutMotionRuntime();

export type BetterChatCutPreviewProps = MotionAssetPreviewInput & {
  mode?: 'preview' | 'still' | 'contact-sheet';
  frame?: number;
  contactSheetFrames?: number[];
  /** Candidate authored bundle — evaluated in Remotion Chromium only. */
  candidateBundleCode?: string;
  candidateProps?: Record<string, unknown>;
};

export function BetterChatCutAssetPreview(props: BetterChatCutPreviewProps) {
  const definition = props.candidateBundleCode
    ? undefined
    : getMotionComponent(props.assetId, props.version);
  const frames = props.contactSheetFrames
    ?? definition?.preview.contactSheetFrames
    ?? [0, 10, 20, 30, 40];
  const mode = props.mode ?? 'preview';
  const width = props.width ?? definition?.preview.width ?? 640;
  const height = props.height ?? definition?.preview.height ?? 360;

  const rendererProps = {
    ...props,
    candidateBundle: props.candidateBundleCode
      ? { code: props.candidateBundleCode, props: props.candidateProps ?? props.props }
      : undefined,
  };

  if (mode === 'contact-sheet') {
    const cols = Math.min(frames.length, 5);
    const cellW = width / cols;
    const cellH = height / Math.ceil(frames.length / cols);
    return (
      <AbsoluteFill style={{ backgroundColor: '#020617', display: 'flex', flexWrap: 'wrap' }}>
        {frames.map((frameNumber, index) => (
          <div
            key={`${frameNumber}-${index}`}
            style={{
              width: `${100 / cols}%`,
              height: cellH,
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid #1e293b',
              boxSizing: 'border-box',
            }}
          >
            <Sequence from={0} durationInFrames={1} layout="none">
              <div style={{ width, height, transform: `scale(${cellW / width})`, transformOrigin: 'top left' }}>
                <MotionAssetRenderer {...rendererProps} frameOverride={frameNumber} />
              </div>
            </Sequence>
            <div style={{ position: 'absolute', left: 6, bottom: 4, color: '#94a3b8', fontSize: 12 }}>
              f{frameNumber}
            </div>
          </div>
        ))}
      </AbsoluteFill>
    );
  }

  return <MotionAssetRenderer {...rendererProps} frameOverride={mode === 'still' ? props.frame : undefined} />;
}
