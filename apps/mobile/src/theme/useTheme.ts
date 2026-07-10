/**
 * useTheme — read the active Bocado theme inside any component below ThemeProvider.
 * Returns the resolved light/dark `Theme` object from tokens.ts.
 */
import { useContext } from 'react';

import { ThemeContext } from './ThemeProvider';
import type { Theme } from './tokens';

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
