import type { MotionAnimationDefinition } from '../contracts/motion-types.ts';
import { getMotionAnimation } from './registry.ts';

/** Looping presets may run for the full node duration. */
export const LOOP_ANIMATION_IDS = new Set([
  'animation.float',
  'animation.pulse',
]);

export type ComposedMotionTransform = {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  opacity: number;
};

export type AnimationApplyRequest = {
  animationId: string;
  animationVersion?: string;
  /** Frame relative to the animation instance start. */
  frame: number;
  fps: number;
  durationInFrames: number;
  params?: Record<string, unknown>;
};

const IDENTITY: ComposedMotionTransform = {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  opacity: 1,
};

/**
 * Compose multiple M2A animation results in array order.
 * Semantics: x/y add, rotation add, scale multiply, opacity multiply.
 */
export function composeMotionAnimationTransforms(
  requests: AnimationApplyRequest[],
): ComposedMotionTransform {
  let result: ComposedMotionTransform = { ...IDENTITY };
  for (const request of requests) {
    const definition = getMotionAnimation(request.animationId, request.animationVersion);
    if (!definition) continue;
    const applied = definition.apply({
      frame: request.frame,
      fps: request.fps,
      durationInFrames: request.durationInFrames,
      props: request.params,
    });
    result = {
      translateX: result.translateX + (applied.translateX ?? 0),
      translateY: result.translateY + (applied.translateY ?? 0),
      scaleX: result.scaleX * (applied.scale ?? 1),
      scaleY: result.scaleY * (applied.scale ?? 1),
      rotationDeg: result.rotationDeg + (applied.rotateDeg ?? 0),
      opacity: result.opacity * (applied.opacity ?? 1),
    };
  }
  return result;
}

export function isLoopAnimation(animationId: string): boolean {
  return LOOP_ANIMATION_IDS.has(animationId);
}

export function getAnimationDefinition(
  animationId: string,
  version?: string,
): MotionAnimationDefinition | undefined {
  return getMotionAnimation(animationId, version);
}
