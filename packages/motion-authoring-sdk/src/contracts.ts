/** Theme tokens available to authored motion components. */
export type MotionThemeTokens = {
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

export type MotionRenderContext = {
  theme?: MotionThemeTokens;
};

export type MotionVideoConfig = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

/** Contract version for authored source + sandbox allowlist. */
export const MOTION_SDK_CONTRACT_VERSION = '1.0.0';
export const MOTION_SDK_PACKAGE_VERSION = '1.0.0';
