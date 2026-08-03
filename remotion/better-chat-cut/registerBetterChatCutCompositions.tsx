import { Composition } from 'remotion';
import {
  BetterChatCutAssetPreview,
  type BetterChatCutPreviewProps,
} from './AssetPreviewComposition.tsx';
import {
  BetterChatCutSceneStill,
  type BetterChatCutSceneStillProps,
} from './BetterChatCutSceneStill.tsx';
import {
  BetterChatCutSceneContactSheet,
  type BetterChatCutSceneContactSheetProps,
} from './BetterChatCutSceneContactSheet.tsx';
import {
  BetterChatCutAssemblyContactSheet,
  type AssemblyContactSheetProps,
} from './AssemblyContactSheet.tsx';
import { getMotionComponent } from '../../packages/motion-components/src/runtime/registry.ts';
import { ensureBetterChatCutMotionRuntime } from '../../packages/motion-components/src/bootstrap.ts';
import type { TimelineState } from '../../src/editor/types.ts';

ensureBetterChatCutMotionRuntime();

const DEFAULT_PROPS: BetterChatCutPreviewProps = {
  assetId: 'primitive.circle',
  version: '1.0.0',
  themeId: 'default',
  mode: 'preview',
};

const DEFAULT_SCENE: BetterChatCutSceneStillProps['scene'] = {
  schemaVersion: '1.0.0',
  id: 'scene.basic-explainer',
  name: 'Basic explainer',
  canvas: { width: 1280, height: 720, backgroundColor: '#0D1021' },
  fps: 30,
  durationInFrames: 90,
  theme: { id: 'default', version: '1.0.0' },
  nodes: [],
};

const EMPTY_TIMELINE: TimelineState = {
  fps: 30,
  width: 1920,
  height: 1080,
  items: [],
  selectedId: null,
};

const DEFAULT_ASSEMBLY_SHEET: AssemblyContactSheetProps = {
  state: EMPTY_TIMELINE,
  frames: [0],
  columns: 4,
  cellWidth: 384,
  cellHeight: 216,
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
      <Composition
        id="BetterChatCutSceneStill"
        component={BetterChatCutSceneStill}
        defaultProps={{
          scene: DEFAULT_SCENE,
          frame: 0,
        } satisfies BetterChatCutSceneStillProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: 1,
          fps: props.scene.fps ?? 30,
          width: props.width ?? props.scene.canvas.width,
          height: props.height ?? props.scene.canvas.height,
        })}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="BetterChatCutSceneContactSheet"
        component={BetterChatCutSceneContactSheet}
        defaultProps={{
          scene: DEFAULT_SCENE,
          frames: [0, 18, 36, 54, 72, 89],
          columns: 3,
          cellLabelMode: 'frame',
          cellWidth: 426,
        } satisfies BetterChatCutSceneContactSheetProps}
        calculateMetadata={({ props }) => {
          const frames = props.frames?.length ? props.frames : [0];
          const columns = props.columns ?? Math.min(frames.length, 3);
          const cellWidth = props.cellWidth ?? 426;
          const rows = Math.ceil(frames.length / columns);
          const cellHeight = Math.round(cellWidth * (props.scene.canvas.height / props.scene.canvas.width));
          return {
            durationInFrames: 1,
            fps: props.scene.fps ?? 30,
            width: props.width ?? cellWidth * columns,
            height: props.height ?? cellHeight * rows,
          };
        }}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="BetterChatCutAssemblyContactSheet"
        component={BetterChatCutAssemblyContactSheet}
        defaultProps={DEFAULT_ASSEMBLY_SHEET}
        calculateMetadata={({ props }) => {
          const frames = props.frames?.length ? props.frames : [0];
          const columns = Math.max(1, props.columns ?? 4);
          const rows = Math.ceil(frames.length / columns);
          const cellWidth = props.cellWidth ?? 384;
          const cellHeight = props.cellHeight ?? 216;
          return {
            durationInFrames: 1,
            fps: props.state?.fps ?? 30,
            width: cellWidth * columns,
            height: cellHeight * rows,
          };
        }}
        durationInFrames={1}
        fps={30}
        width={1536}
        height={216}
      />
    </>
  );
}
