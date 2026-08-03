import type { ComponentType } from 'react';

export type MotionKind =
  | 'primitive'
  | 'object'
  | 'character'
  | 'background'
  | 'ui'
  | 'diagram'
  | 'effect'
  | 'animation';

export type MotionPreviewSpec = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  stillFrame: number;
  contactSheetFrames: number[];
};

export type MotionComponentDefinition<TProps extends Record<string, unknown> = Record<string, unknown>> = {
  assetId: string;
  assetVersion: string;
  displayName: string;
  description: string;
  kind: MotionKind;
  component: ComponentType<TProps>;
  defaultProps: TProps;
  propsSchema?: Record<string, unknown>;
  preview: MotionPreviewSpec;
  supportedThemes?: string[];
  supportedAnimations?: string[];
};

export type MotionAnimationDefinition = {
  assetId: string;
  assetVersion: string;
  displayName: string;
  description: string;
  /** Apply animation style for the given local frame. */
  apply: (args: {
    frame: number;
    fps: number;
    durationInFrames: number;
    props?: Record<string, unknown>;
  }) => {
    opacity?: number;
    translateX?: number;
    translateY?: number;
    scale?: number;
    rotateDeg?: number;
  };
  defaultProps?: Record<string, unknown>;
  preview: MotionPreviewSpec;
};

export type MotionThemeDefinition = {
  id: string;
  displayName: string;
  colors: {
    background: string;
    foreground: string;
    accent: string;
    muted: string;
    border: string;
  };
  typography: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
  };
  spacing: {
    sm: number;
    md: number;
    lg: number;
  };
};

export type MotionValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type MotionAssetPreviewInput = {
  assetId: string;
  version?: string;
  props?: Record<string, unknown>;
  themeId?: string;
  animationId?: string;
  animationProps?: Record<string, unknown>;
  width?: number;
  height?: number;
  fps?: number;
  durationInFrames?: number;
  background?: string;
};
