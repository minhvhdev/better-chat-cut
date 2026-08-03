import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionAssetPreviewInput } from '../contracts/motion-types.ts';
import {
  getMotionAnimation,
  getMotionComponent,
  getMotionTheme,
  validateMotionProps,
} from '../runtime/registry.ts';

export type MotionAssetRendererProps = MotionAssetPreviewInput & {
  frameOverride?: number;
};

export function MotionAssetRenderer(input: MotionAssetRendererProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const definition = getMotionComponent(input.assetId, input.version);
  if (!definition) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111', color: '#f88', alignItems: 'center', justifyContent: 'center' }}>
        Missing runtime for {input.assetId}
      </AbsoluteFill>
    );
  }

  const theme = getMotionTheme(input.themeId ?? 'default') ?? getMotionTheme('default')!;
  const validated = validateMotionProps(definition.propsSchema, input.props ?? {}, definition.defaultProps);
  const Component = definition.component;
  const localFrame = input.frameOverride ?? frame;
  const animation = input.animationId ? getMotionAnimation(input.animationId) : undefined;
  const transform = animation?.apply({
    frame: localFrame,
    fps,
    durationInFrames,
    props: input.animationProps,
  }) ?? {};

  return (
    <AbsoluteFill style={{ backgroundColor: input.background ?? theme.colors.background }}>
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: transform.opacity ?? 1,
          transform: [
            transform.translateX ? `translateX(${transform.translateX}px)` : null,
            transform.translateY ? `translateY(${transform.translateY}px)` : null,
            transform.scale != null ? `scale(${transform.scale})` : null,
            transform.rotateDeg != null ? `rotate(${transform.rotateDeg}deg)` : null,
          ].filter(Boolean).join(' ') || undefined,
        }}
      >
        <Component {...validated.normalizedProps} theme={theme} />
      </div>
    </AbsoluteFill>
  );
}
