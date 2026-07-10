/**
 * Icon — the single icon primitive. Wraps lucide-react-native (backed by
 * react-native-svg) and centralizes default size + theme-aware color.
 *
 * HARD RULE (DESIGN.md §8 / BRANDING.md §6): never emoji as icons — always
 * lucide. Color is never the only signal; suitability still pairs icon + word.
 *
 * `name` is any lucide icon name (PascalCase), e.g. 'ChevronLeft', 'Camera'.
 */
import React from 'react';
import * as LucideIcons from 'lucide-react-native';

import { useTheme } from '@/theme/useTheme';

type LucideComponent = React.ComponentType<{
  size?: string | number;
  color?: string;
  strokeWidth?: string | number;
}>;

/** Names of the lucide exports that are actual icon components. */
export type IconName = {
  [K in keyof typeof LucideIcons]: (typeof LucideIcons)[K] extends LucideComponent ? K : never;
}[keyof typeof LucideIcons];

export interface IconProps {
  name: IconName;
  size?: number;
  /** Any color string. Defaults to the theme's primary text color. */
  color?: string;
}

export function Icon({ name, size = 20, color }: IconProps): React.JSX.Element {
  const theme = useTheme();
  const Glyph = LucideIcons[name] as LucideComponent;
  return <Glyph size={size} color={color ?? theme.color.text} strokeWidth={2} />;
}
