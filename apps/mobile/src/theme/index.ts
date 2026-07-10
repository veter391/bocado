/**
 * Theme barrel — the single import surface for design-system foundations:
 *
 *   import { useTheme, ThemeProvider, motion } from '@/theme';
 *
 * Re-exports the token values + types, the provider, the active-theme hook, the
 * font loader, and the motion system (as the `motion` namespace, matching how
 * screens consume it: `motion.presets`, `motion.motionDuration`, ...).
 */
export * from './tokens';

export { ThemeProvider } from './ThemeProvider';
export type { ThemeProviderProps } from './ThemeProvider';
export { useTheme } from './useTheme';
export { useAppFonts } from './fonts';

import * as motion from './motion';
export { motion };
