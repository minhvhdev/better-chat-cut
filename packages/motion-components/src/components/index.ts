import { createElement } from 'react';
import type { MotionThemeDefinition } from '../contracts/motion-types.ts';
import { registerMotionComponent } from '../runtime/registry.ts';

type ThemeProp = { theme?: MotionThemeDefinition };

type CircleProps = ThemeProp & {
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

export function Circle({ radius = 80, fill, stroke, strokeWidth = 0, theme }: CircleProps) {
  const size = radius * 2;
  return createElement(
    'svg',
    { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    createElement('circle', {
      cx: radius,
      cy: radius,
      r: radius - strokeWidth,
      fill: fill ?? theme?.colors.accent ?? '#38bdf8',
      stroke: stroke ?? 'none',
      strokeWidth,
    }),
  );
}

type RectProps = ThemeProp & {
  width?: number;
  height?: number;
  fill?: string;
  cornerRadius?: number;
};

export function Rectangle({ width = 220, height = 120, fill, cornerRadius = 16, theme }: RectProps) {
  return createElement(
    'svg',
    { width, height, viewBox: `0 0 ${width} ${height}` },
    createElement('rect', {
      x: 0,
      y: 0,
      width,
      height,
      rx: cornerRadius,
      fill: fill ?? theme?.colors.accent ?? '#38bdf8',
    }),
  );
}

type LineProps = ThemeProp & {
  length?: number;
  stroke?: string;
  strokeWidth?: number;
};

export function Line({ length = 240, stroke, strokeWidth = 6, theme }: LineProps) {
  const h = strokeWidth + 8;
  return createElement(
    'svg',
    { width: length, height: h, viewBox: `0 0 ${length} ${h}` },
    createElement('line', {
      x1: 0,
      y1: h / 2,
      x2: length,
      y2: h / 2,
      stroke: stroke ?? theme?.colors.foreground ?? '#e2e8f0',
      strokeWidth,
      strokeLinecap: 'round',
    }),
  );
}

type ArrowProps = ThemeProp & {
  length?: number;
  stroke?: string;
  strokeWidth?: number;
};

export function Arrow({ length = 240, stroke, strokeWidth = 6, theme }: ArrowProps) {
  const color = stroke ?? theme?.colors.accent ?? '#38bdf8';
  const mid = 20;
  return createElement(
    'svg',
    { width: length, height: 40, viewBox: `0 0 ${length} 40` },
    createElement('line', {
      x1: 0,
      y1: 20,
      x2: length - 18,
      y2: 20,
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
    }),
    createElement('polygon', {
      points: `${length - 2},${mid} ${length - 22},${mid - 10} ${length - 22},${mid + 10}`,
      fill: color,
    }),
  );
}

type SolidProps = ThemeProp & { color?: string };

export function SolidBackground({ color, theme }: SolidProps) {
  return createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      background: color ?? theme?.colors.background ?? '#0f172a',
    },
  });
}

type LabelProps = ThemeProp & {
  text?: string;
  color?: string;
  fontSize?: number;
};

export function Label({ text = 'Label', color, fontSize, theme }: LabelProps) {
  return createElement(
    'div',
    {
      style: {
        color: color ?? theme?.colors.foreground ?? '#e2e8f0',
        fontFamily: theme?.typography.fontFamily,
        fontSize: fontSize ?? theme?.typography.fontSize ?? 28,
        fontWeight: theme?.typography.fontWeight ?? 600,
        padding: theme?.spacing.md ?? 16,
      },
    },
    text,
  );
}

const preview = {
  width: 640,
  height: 360,
  fps: 30,
  durationInFrames: 45,
  stillFrame: 15,
  contactSheetFrames: [0, 12, 24, 36, 44],
};

export function registerBuiltInComponents(): void {
  registerMotionComponent({
    assetId: 'primitive.circle',
    assetVersion: '1.0.0',
    displayName: 'Circle',
    description: 'Reusable circle primitive',
    kind: 'primitive',
    component: Circle as never,
    defaultProps: { radius: 80 },
    propsSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        radius: { type: 'number', minimum: 1, maximum: 500 },
        fill: { type: 'string' },
        stroke: { type: 'string' },
        strokeWidth: { type: 'number', minimum: 0, maximum: 40 },
      },
    },
    preview,
    supportedThemes: ['default', 'high-contrast'],
    supportedAnimations: ['animation.fade-in', 'animation.slide-in', 'animation.pop-in', 'animation.float', 'animation.pulse'],
  });

  registerMotionComponent({
    assetId: 'primitive.rectangle',
    assetVersion: '1.0.0',
    displayName: 'Rectangle',
    description: 'Reusable rectangle primitive',
    kind: 'primitive',
    component: Rectangle as never,
    defaultProps: { width: 220, height: 120, cornerRadius: 16 },
    propsSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        width: { type: 'number', minimum: 1 },
        height: { type: 'number', minimum: 1 },
        fill: { type: 'string' },
        cornerRadius: { type: 'number', minimum: 0 },
      },
    },
    preview,
    supportedThemes: ['default', 'high-contrast'],
    supportedAnimations: ['animation.fade-in', 'animation.slide-in', 'animation.pop-in', 'animation.float', 'animation.pulse'],
  });

  registerMotionComponent({
    assetId: 'primitive.line',
    assetVersion: '1.0.0',
    displayName: 'Line',
    description: 'Reusable line primitive',
    kind: 'primitive',
    component: Line as never,
    defaultProps: { length: 240, strokeWidth: 6 },
    propsSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        length: { type: 'number', minimum: 1 },
        stroke: { type: 'string' },
        strokeWidth: { type: 'number', minimum: 1 },
      },
    },
    preview,
    supportedThemes: ['default', 'high-contrast'],
    supportedAnimations: ['animation.fade-in', 'animation.slide-in'],
  });

  registerMotionComponent({
    assetId: 'primitive.arrow',
    assetVersion: '1.0.0',
    displayName: 'Arrow',
    description: 'Reusable arrow primitive',
    kind: 'primitive',
    component: Arrow as never,
    defaultProps: { length: 240, strokeWidth: 6 },
    propsSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        length: { type: 'number', minimum: 1 },
        stroke: { type: 'string' },
        strokeWidth: { type: 'number', minimum: 1 },
      },
    },
    preview,
    supportedThemes: ['default', 'high-contrast'],
    supportedAnimations: ['animation.fade-in', 'animation.slide-in', 'animation.pop-in'],
  });

  registerMotionComponent({
    assetId: 'background.solid',
    assetVersion: '1.0.0',
    displayName: 'Solid Background',
    description: 'Full-bleed solid color background',
    kind: 'background',
    component: SolidBackground as never,
    defaultProps: {},
    propsSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { color: { type: 'string' } },
    },
    preview,
    supportedThemes: ['default', 'high-contrast'],
    supportedAnimations: ['animation.fade-in'],
  });

  registerMotionComponent({
    assetId: 'ui.label',
    assetVersion: '1.0.0',
    displayName: 'Label',
    description: 'Simple text label',
    kind: 'ui',
    component: Label as never,
    defaultProps: { text: 'Label' },
    propsSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string' },
        color: { type: 'string' },
        fontSize: { type: 'number', minimum: 8, maximum: 200 },
      },
    },
    preview,
    supportedThemes: ['default', 'high-contrast'],
    supportedAnimations: ['animation.fade-in', 'animation.slide-in', 'animation.pop-in'],
  });
}
