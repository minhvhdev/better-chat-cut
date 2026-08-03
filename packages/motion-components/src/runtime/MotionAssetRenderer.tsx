import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionAssetPreviewInput } from '../contracts/motion-types.ts';
import {
  getMotionAnimation,
  getMotionComponent,
  getMotionTheme,
  validateMotionProps,
} from '../runtime/registry.ts';
import { SandboxedUserMotion } from './SandboxedUserMotion.tsx';

export type MotionAssetRendererProps = MotionAssetPreviewInput & {
  frameOverride?: number;
  /** Candidate preview: evaluate bundle without registering in normal runtime. */
  candidateBundle?: {
    code: string;
    props?: Record<string, unknown>;
  };
};

export function MotionAssetRenderer(input: MotionAssetRendererProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const theme = getMotionTheme(input.themeId ?? 'default') ?? getMotionTheme('default')!;
  const localFrame = input.frameOverride ?? frame;

  if (input.candidateBundle) {
    return (
      <AbsoluteFill style={{ backgroundColor: input.background ?? theme.colors.background }}>
        <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SandboxedUserMotion
            bundleCode={input.candidateBundle.code}
            componentProps={input.candidateBundle.props ?? input.props ?? {}}
            theme={theme}
          />
        </div>
      </AbsoluteFill>
    );
  }

  const definition = getMotionComponent(input.assetId, input.version);
  if (!definition) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111', color: '#f88', alignItems: 'center', justifyContent: 'center' }}>
        Missing runtime for {input.assetId}
      </AbsoluteFill>
    );
  }

  const validated = validateMotionProps(definition.propsSchema, input.props ?? {}, definition.defaultProps);
  const animation = input.animationId ? getMotionAnimation(input.animationId) : undefined;
  const transform = animation?.apply({
    frame: localFrame,
    fps,
    durationInFrames,
    props: input.animationProps,
  }) ?? {};

  const inner = definition.sandboxedBundle
    ? (
      <SandboxedUserMotion
        bundleCode={definition.sandboxedBundle.code}
        componentProps={validated.normalizedProps}
        theme={theme}
      />
    )
    : definition.component
      ? React.createElement(definition.component, { ...validated.normalizedProps, theme } as never)
      : (
        <div style={{ color: '#f88' }}>No component implementation</div>
      );

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
        {inner}
      </div>
    </AbsoluteFill>
  );
}
