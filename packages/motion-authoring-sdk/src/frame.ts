import type { MotionVideoConfig } from './contracts.ts';

type FrameHooks = {
  useMotionFrame: () => number;
  useMotionVideoConfig: () => MotionVideoConfig;
};

let hooks: FrameHooks | null = null;

/**
 * Inject Remotion (or test) frame hooks. Called by the Chromium sandbox host only.
 * Authored source must not call this.
 */
export function __setMotionFrameHooks(next: FrameHooks | null): void {
  hooks = next;
}

export function useMotionFrame(): number {
  if (!hooks) {
    throw new Error('useMotionFrame requires the Better Chat Cut motion sandbox host');
  }
  return hooks.useMotionFrame();
}

export function useMotionVideoConfig(): MotionVideoConfig {
  if (!hooks) {
    throw new Error('useMotionVideoConfig requires the Better Chat Cut motion sandbox host');
  }
  return hooks.useMotionVideoConfig();
}
