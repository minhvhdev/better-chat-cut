/** Map scene theme ids to motion theme registry ids. */
export function resolveThemeRegistryId(themeId: string): string {
  if (themeId === 'better-chat-cut.default') return 'default';
  if (themeId === 'better-chat-cut.high-contrast') return 'high-contrast';
  return themeId;
}

export const BUILTIN_THEME_VERSION = '1.0.0';
