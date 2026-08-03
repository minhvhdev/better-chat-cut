import { Composition } from 'remotion';
import {
  BetterChatCutAssetPreview,
  type BetterChatCutPreviewProps,
} from './AssetPreviewComposition.tsx';
import { getMotionComponent } from '../../packages/motion-components/src/runtime/registry.ts';
import { ensureBetterChatCutMotionRuntime } from '../../packages/motion-components/src/bootstrap.ts';

ensureBetterChatCutMotionRuntime();

const DEFAULT_PROPS: BetterChatCutPreviewProps = {
  assetId: 'primitive.circle',
  version: '1.0.0',
  themeId: 'default',
  mode: 'preview',
};

export function BetterChatCutCompositions() {
  return (
    <>
      <Composition
        id="BetterChatCutAssetPreview"
        component={BetterChatCutAssetPreview}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={({ props }) => {
          const definition = getMotionComponent(props.assetId, props.version);
          return {
            durationInFrames: Math.max(1, props.durationInFrames ?? definition?.preview.durationInFrames ?? 45),
            fps: props.fps ?? definition?.preview.fps ?? 30,
            width: props.width ?? definition?.preview.width ?? 640,
            height: props.height ?? definition?.preview.height ?? 360,
          };
        }}
        durationInFrames={45}
        fps={30}
        width={640}
        height={360}
      />
      <Composition
        id="BetterChatCutAssetStill"
        component={BetterChatCutAssetPreview}
        defaultProps={{ ...DEFAULT_PROPS, mode: 'still', frame: 15 }}
        calculateMetadata={({ props }) => {
          const definition = getMotionComponent(props.assetId, props.version);
          return {
            durationInFrames: Math.max(1, props.durationInFrames ?? definition?.preview.durationInFrames ?? 45),
            fps: props.fps ?? definition?.preview.fps ?? 30,
            width: props.width ?? definition?.preview.width ?? 640,
            height: props.height ?? definition?.preview.height ?? 360,
          };
        }}
        durationInFrames={45}
        fps={30}
        width={640}
        height={360}
      />
      <Composition
        id="BetterChatCutAssetContactSheet"
        component={BetterChatCutAssetPreview}
        defaultProps={{ ...DEFAULT_PROPS, mode: 'contact-sheet' }}
        calculateMetadata={({ props }) => {
          const definition = getMotionComponent(props.assetId, props.version);
          return {
            durationInFrames: 1,
            fps: props.fps ?? definition?.preview.fps ?? 30,
            width: props.width ?? definition?.preview.width ?? 640,
            height: props.height ?? definition?.preview.height ?? 360,
          };
        }}
        durationInFrames={1}
        fps={30}
        width={640}
        height={360}
      />
    </>
  );
}
