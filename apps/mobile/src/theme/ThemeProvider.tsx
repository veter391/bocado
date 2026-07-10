/**
 * ThemeProvider — resolves the active Bocado theme from the OS color scheme and
 * exposes it through React context. Light/dark come straight from `themes` in
 * tokens.ts (the single source of truth); this file never defines colors.
 *
 * Components read the theme via `useTheme()` (see ./useTheme.ts).
 */
import React, { createContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { themes, type Theme } from './tokens';

export const ThemeContext = createContext<Theme>(themes.light);

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Force a theme regardless of the OS setting. Mainly for tests, previews, and
   * Storybook-style harnesses. Omit in the app so it follows the system.
   */
  forceScheme?: 'light' | 'dark';
}

/** Web-only: allow `?theme=light|dark` to override the scheme (previews/testing). No-op on native. */
function urlScheme(): 'light' | 'dark' | undefined {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return undefined;
  const v = new URLSearchParams(window.location.search).get('theme');
  return v === 'light' || v === 'dark' ? v : undefined;
}

export function ThemeProvider({ children, forceScheme }: ThemeProviderProps): React.JSX.Element {
  const systemScheme = useColorScheme();
  const scheme = forceScheme ?? urlScheme() ?? (systemScheme === 'dark' ? 'dark' : 'light');

  const theme = useMemo<Theme>(() => themes[scheme], [scheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
