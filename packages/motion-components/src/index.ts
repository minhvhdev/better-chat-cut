export type {
  MotionAnimationDefinition,
  MotionAssetPreviewInput,
  MotionComponentDefinition,
  MotionThemeDefinition,
  MotionValidationIssue,
  SandboxedMotionBundle,
} from './contracts/motion-types.ts';

export {
  computeRuntimeRevision,
  getMotionAnimation,
  getMotionComponent,
  getMotionTheme,
  listMotionAnimations,
  listMotionComponents,
  listMotionThemes,
  validateMotionProps,
} from './runtime/registry.ts';

export { ensureBetterChatCutMotionRuntime } from './bootstrap.ts';

// React/Remotion renderer is imported directly by remotion/better-chat-cut/*
// to keep server-side MCP imports free of JSX.
