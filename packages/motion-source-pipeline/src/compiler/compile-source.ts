import Babel from '@babel/standalone';
import { MAX_BUNDLE_BYTES } from '../constants.ts';
import { MotionSourceError } from '../errors.ts';

const BUNDLE_FORBIDDEN: [RegExp, string][] = [
  [/\bimport\s*[({]/, 'dynamic import()'],
  [/\brequire\s*\(/, 'require()'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bprocess\b/, 'process'],
  [/\b__dirname\b/, '__dirname'],
  [/\b__filename\b/, '__filename'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/node:/, 'node: builtin'],
];

function stripSdkImports(source: string): string {
  // Remove allowed SDK import lines; APIs are injected as sandbox globals.
  return source.replace(
    /^\s*import\s+[\s\S]*?\s+from\s+["']@better-chat-cut\/motion-sdk["']\s*;?\s*$/gm,
    '',
  );
}

function rewriteNamedExport(source: string, exportName: string): string {
  // export const Name = ...  →  const Name = ...
  const re = new RegExp(`export\\s+const\\s+(${exportName})\\s*=`, 'g');
  return source.replace(re, 'const $1 =');
}

export function compileMotionSourceToBundle(input: {
  source: string;
  exportName: string;
}): { code: string; byteLength: number } {
  const stripped = rewriteNamedExport(stripSdkImports(input.source), input.exportName);
  let output: string | null | undefined;
  try {
    output = Babel.transform(stripped, {
      presets: [
        ['typescript', { onlyRemoveTypeImports: true }],
        ['react', { runtime: 'classic' }],
      ],
      plugins: ['syntax-jsx'],
      filename: 'index.tsx',
      sourceMaps: false,
      compact: false,
    }).code;
  } catch (error) {
    throw new MotionSourceError(
      'MOTION_SOURCE_BUILD_FAILED',
      error instanceof Error ? error.message : 'Babel transform failed',
      { recovery: 'Fix TypeScript/JSX errors and rebuild.' },
    );
  }
  if (!output) {
    throw new MotionSourceError('MOTION_SOURCE_BUILD_FAILED', 'Compiler produced empty output');
  }

  const code = `"use strict";\n${output}\n;return ${input.exportName};\n`;
  const byteLength = Buffer.byteLength(code, 'utf8');
  if (byteLength > MAX_BUNDLE_BYTES) {
    throw new MotionSourceError(
      'MOTION_SOURCE_BUILD_TOO_LARGE',
      `Bundle exceeds ${MAX_BUNDLE_BYTES} bytes`,
      { recovery: 'Simplify the component source.' },
    );
  }

  for (const [re, reason] of BUNDLE_FORBIDDEN) {
    if (re.test(code)) {
      throw new MotionSourceError(
        'MOTION_SOURCE_BUNDLE_UNSAFE',
        `Compiled bundle contains forbidden pattern: ${reason}`,
      );
    }
  }

  // Reject absolute Windows/Unix paths leaked into bundle.
  if (/[A-Za-z]:\\/.test(code) || /\/Users\/|\/home\//.test(code)) {
    throw new MotionSourceError(
      'MOTION_SOURCE_BUNDLE_UNSAFE',
      'Compiled bundle appears to contain absolute local paths',
    );
  }

  return { code, byteLength };
}
