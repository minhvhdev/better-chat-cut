import type { MotionAnimationDefinition } from '../contracts/motion-types.ts';
import { registerMotionAnimation } from '../runtime/registry.ts';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

const preview = {
  width: 640,
  height: 360,
  fps: 30,
  durationInFrames: 45,
  stillFrame: 20,
  contactSheetFrames: [0, 10, 20, 30, 44],
};

function make(
  assetId: string,
  displayName: string,
  description: string,
  apply: MotionAnimationDefinition['apply'],
): MotionAnimationDefinition {
  return {
    assetId,
    assetVersion: '1.0.0',
    displayName,
    description,
    apply,
    preview,
  };
}

export const fadeIn = make('animation.fade-in', 'Fade In', 'Fade opacity from 0 to 1', ({ frame, durationInFrames }) => {
  const t = easeOutCubic(clamp01(frame / Math.max(1, durationInFrames - 1)));
  return { opacity: t };
});

export const slideIn = make('animation.slide-in', 'Slide In', 'Slide from left while fading in', ({ frame, durationInFrames }) => {
  const t = easeOutCubic(clamp01(frame / Math.max(1, durationInFrames - 1)));
  return { opacity: t, translateX: (1 - t) * -80 };
});

export const popIn = make('animation.pop-in', 'Pop In', 'Scale up with fade', ({ frame, durationInFrames }) => {
  const t = easeOutCubic(clamp01(frame / Math.max(1, durationInFrames - 1)));
  return { opacity: t, scale: 0.6 + 0.4 * t };
});

export const floatAnim = make('animation.float', 'Float', 'Gentle vertical float loop', ({ frame, fps }) => {
  const wave = Math.sin((frame / fps) * Math.PI * 2);
  return { translateY: wave * 12 };
});

export const pulse = make('animation.pulse', 'Pulse', 'Subtle scale pulse', ({ frame, fps }) => {
  const wave = (Math.sin((frame / fps) * Math.PI * 2) + 1) / 2;
  return { scale: 0.92 + wave * 0.08 };
});

export function registerBuiltInAnimations(): void {
  for (const definition of [fadeIn, slideIn, popIn, floatAnim, pulse]) {
    registerMotionAnimation(definition);
  }
}
