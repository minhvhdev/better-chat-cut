import type { MotionThemeTokens } from './contracts.ts';

const TOKEN_PATHS: Record<string, (theme: MotionThemeTokens) => string> = {
  'colors.background': (t) => t.colors.background,
  'colors.foreground': (t) => t.colors.foreground,
  'colors.accent': (t) => t.colors.accent,
  'colors.muted': (t) => t.colors.muted,
  'colors.border': (t) => t.colors.border,
};

/** Resolve a theme token path, or return the fallback / raw color string. */
export function resolveThemeColor(
  theme: MotionThemeTokens | undefined,
  tokenOrColor: string,
  fallback?: string,
): string {
  if (theme && tokenOrColor in TOKEN_PATHS) {
    return TOKEN_PATHS[tokenOrColor](theme);
  }
  if (theme && tokenOrColor.startsWith('colors.')) {
    const resolver = TOKEN_PATHS[tokenOrColor];
    if (resolver) return resolver(theme);
  }
  if (tokenOrColor.startsWith('#') || tokenOrColor.startsWith('rgb') || tokenOrColor.startsWith('hsl')) {
    return tokenOrColor;
  }
  return fallback ?? tokenOrColor;
}
