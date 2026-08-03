/** Clamp n into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Map value from [inMin, inMax] into [outMin, outMax]. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

/** Linear mix between a and b. */
export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-driven interpolate (deterministic; no easing tables beyond linear/easing fn).
 * Mirrors Remotion interpolate for the common numeric case.
 */
export function interpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  options?: { extrapolateLeft?: 'clamp' | 'extend'; extrapolateRight?: 'clamp' | 'extend' },
): number {
  if (inputRange.length < 2 || outputRange.length < 2) {
    throw new Error('interpolate requires ranges of length >= 2');
  }
  if (inputRange.length !== outputRange.length) {
    throw new Error('interpolate inputRange and outputRange must match length');
  }

  const extrapolateLeft = options?.extrapolateLeft ?? 'clamp';
  const extrapolateRight = options?.extrapolateRight ?? 'clamp';

  if (input <= inputRange[0]) {
    if (extrapolateLeft === 'clamp') return outputRange[0];
    const t = (input - inputRange[0]) / (inputRange[1] - inputRange[0]);
    return mix(outputRange[0], outputRange[1], t);
  }
  const last = inputRange.length - 1;
  if (input >= inputRange[last]) {
    if (extrapolateRight === 'clamp') return outputRange[last];
    const t = (input - inputRange[last - 1]) / (inputRange[last] - inputRange[last - 1]);
    return mix(outputRange[last - 1], outputRange[last], t);
  }

  for (let i = 0; i < last; i += 1) {
    const left = inputRange[i];
    const right = inputRange[i + 1];
    if (input >= left && input <= right) {
      const t = (input - left) / (right - left);
      return mix(outputRange[i], outputRange[i + 1], t);
    }
  }
  return outputRange[last];
}

/** Simple critically-damped spring approximation driven by frame (deterministic). */
export function spring(args: {
  frame: number;
  fps: number;
  config?: { damping?: number; mass?: number; stiffness?: number };
  from?: number;
  to?: number;
  durationInFrames?: number;
}): number {
  const from = args.from ?? 0;
  const to = args.to ?? 1;
  const damping = args.config?.damping ?? 14;
  const mass = Math.max(0.1, args.config?.mass ?? 1);
  const stiffness = args.config?.stiffness ?? 120;
  const duration = args.durationInFrames ?? Math.round(args.fps);
  const t = clamp(args.frame / Math.max(1, duration), 0, 1);
  // Under-damped envelope toward target; frame-only, no wall clock.
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const decay = Math.exp(-zeta * omega * t * 6);
  const progress = 1 - decay * (1 - t);
  return mix(from, to, clamp(progress, 0, 1));
}
