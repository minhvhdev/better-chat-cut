/**
 * Restricted Function evaluation for authored motion bundles.
 * MUST only run inside Remotion Chromium compositions — never in the Node MCP/server process.
 *
 * Pattern mirrors src/template-host.ts: static checks + shadowed globals whitelist.
 */
import * as React from 'react';
import {
  clamp,
  defineMotionComponent,
  interpolate,
  mapRange,
  mix,
  resolveThemeColor,
  spring,
  useMotionFrame,
  useMotionVideoConfig,
  __setMotionFrameHooks,
} from '../../../motion-authoring-sdk/src/index.ts';
import { useCurrentFrame, useVideoConfig } from 'remotion';

const WHITELIST: Record<string, unknown> = {
  React,
  defineMotionComponent,
  useMotionFrame,
  useMotionVideoConfig,
  interpolate,
  spring,
  clamp,
  mapRange,
  mix,
  resolveThemeColor,
  Math: Object.freeze({
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    atan2: Math.atan2,
    ceil: Math.ceil,
    cos: Math.cos,
    exp: Math.exp,
    floor: Math.floor,
    hypot: Math.hypot,
    log: Math.log,
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    round: Math.round,
    sign: Math.sign,
    sin: Math.sin,
    sqrt: Math.sqrt,
    tan: Math.tan,
    PI: Math.PI,
    E: Math.E,
  }),
};

const SHADOW = [
  'window', 'self', 'globalThis', 'document', 'navigator', 'location', 'history',
  'parent', 'top', 'opener', 'frames', 'Function', 'require', 'module',
  'exports', 'process', 'importScripts', 'postMessage', 'fetch', 'XMLHttpRequest',
  'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB',
  'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame',
  'alert', 'prompt', 'confirm', 'open', 'Worker', 'SharedWorker', 'Notification',
  'Date', 'performance', 'crypto', 'Buffer', 'WebAssembly',
];

const FORBIDDEN: [RegExp, string][] = [
  [/\bimport\s*[({]/, 'dynamic import()'],
  [/(^|[^.\w])import\s+[\w{*"']/m, 'import statement'],
  [/\brequire\s*\(/, 'require()'],
  [/\beval\b/, 'eval'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\.\s*constructor\b/, '.constructor'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bMath\s*\.\s*random\b/, 'Math.random'],
  [/\bDate\b/, 'Date'],
];

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

export function validateSandboxedBundle(code: string): void {
  const scan = stripComments(code);
  for (const [re, reason] of FORBIDDEN) {
    if (re.test(scan)) throw new Error(`sandbox rejected: ${reason}`);
  }
}

const cache = new Map<string, React.ComponentType<Record<string, unknown>>>();

export function evaluateSandboxedMotionBundle(
  code: string,
): React.ComponentType<Record<string, unknown>> {
  const cached = cache.get(code);
  if (cached) return cached;

  validateSandboxedBundle(code);
  const names = [...Object.keys(WHITELIST), ...SHADOW];
  const values = [...Object.values(WHITELIST), ...SHADOW.map(() => undefined)];
  const factory = new Function(...names, `"use strict";\n${code}`);
  const component = factory(...values) as React.ComponentType<Record<string, unknown>>;
  if (typeof component !== 'function') {
    throw new Error('sandbox: compiled bundle did not return a component function');
  }
  cache.set(code, component);
  return component;
}

/** Remotion Chromium host — wires frame hooks then renders the sandboxed component. */
export function SandboxedUserMotion(props: {
  bundleCode: string;
  componentProps?: Record<string, unknown>;
  theme?: unknown;
}) {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  __setMotionFrameHooks({
    useMotionFrame: () => frame,
    useMotionVideoConfig: () => ({
      width: config.width,
      height: config.height,
      fps: config.fps,
      durationInFrames: config.durationInFrames,
    }),
  });

  const Component = React.useMemo(
    () => evaluateSandboxedMotionBundle(props.bundleCode),
    [props.bundleCode],
  );

  return React.createElement(Component, {
    ...(props.componentProps ?? {}),
    theme: props.theme,
  });
}
