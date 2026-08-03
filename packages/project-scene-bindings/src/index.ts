export * from './contracts/index.ts';
export * from './schema/index.ts';
export * from './timeline/index.ts';
export { validateBetterChatCutSceneClipReadiness } from './render/scene-clip-readiness.ts';
export {
  assertSceneClipExportReady,
  validateSceneClipRenderBinding,
} from './render/scene-clip-render-validation.ts';
export * from './runtime/index.ts';

// React renderer: import from `./render/BetterChatCutTimelineScene.tsx` (or remotion re-export) to keep Node barrels JSX-free.
