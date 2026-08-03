import type { MotionThemeDefinition } from '../contracts/motion-types.ts';
import { registerMotionTheme } from '../runtime/registry.ts';

export const defaultTheme: MotionThemeDefinition = {
  id: 'default',
  displayName: 'Default',
  colors: {
    background: '#0f172a',
    foreground: '#e2e8f0',
    accent: '#38bdf8',
    muted: '#64748b',
    border: '#334155',
  },
  typography: {
    fontFamily: 'Inter, Segoe UI, sans-serif',
    fontSize: 28,
    fontWeight: 600,
  },
  spacing: { sm: 8, md: 16, lg: 32 },
};

export const highContrastTheme: MotionThemeDefinition = {
  id: 'high-contrast',
  displayName: 'High Contrast',
  colors: {
    background: '#000000',
    foreground: '#ffffff',
    accent: '#ffff00',
    muted: '#c0c0c0',
    border: '#ffffff',
  },
  typography: {
    fontFamily: 'Arial, sans-serif',
    fontSize: 30,
    fontWeight: 700,
  },
  spacing: { sm: 8, md: 16, lg: 32 },
};

export function registerBuiltInThemes(): void {
  registerMotionTheme(defaultTheme);
  registerMotionTheme(highContrastTheme);
}
