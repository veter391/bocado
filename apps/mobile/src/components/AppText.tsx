/**
 * AppText — the only text primitive in Bocado. Every string on screen goes
 * through here so typography (Plus Jakarta Sans, design-v2), color tokens, and
 * Dynamic Type behavior stay consistent.
 *
 * Variants map 1:1 to tokens.typography (DESIGN.md §4). Body stays >= 16pt.
 * `data` uses tabular figures so kcal/macro columns align. Headings/data carry a
 * slight negative `tracking` (letterSpacing) for a tighter, premium feel.
 */
import React, { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import type { Theme } from '@/theme/tokens';

export type AppTextVariant = 'display' | 'title' | 'body' | 'label' | 'caption' | 'data';
export type AppTextColor = 'text' | 'textSoft' | 'textFaint' | 'primary' | 'onPrimary';

export interface AppTextProps {
  variant: AppTextVariant;
  color?: AppTextColor;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

const COLOR_MAP: Record<AppTextColor, keyof Theme['color']> = {
  text: 'text',
  textSoft: 'textSoft',
  textFaint: 'textFaint',
  primary: 'primary',
  onPrimary: 'onPrimary',
};

function variantStyle(theme: Theme, variant: AppTextVariant): TextStyle {
  const t = theme.typography[variant];
  const base: TextStyle = {
    fontFamily: t.family,
    fontSize: t.size,
    lineHeight: t.lineHeight,
    // Negative on headings/data for a tighter, premium read; 0 on body/label.
    letterSpacing: t.tracking,
  };
  if (variant === 'data') {
    base.fontVariant = ['tabular-nums'];
  }
  return base;
}

export function AppText({
  variant,
  color = 'text',
  numberOfLines,
  style,
  children,
}: AppTextProps): React.JSX.Element {
  const theme = useTheme();

  const composed = useMemo<TextStyle>(
    () => ({
      ...variantStyle(theme, variant),
      color: theme.color[COLOR_MAP[color]],
    }),
    [theme, variant, color],
  );

  return (
    <Text
      style={[composed, style]}
      numberOfLines={numberOfLines}
      // Long content wraps to numberOfLines then ellipsizes (DESIGN.md §3).
      ellipsizeMode={numberOfLines ? 'tail' : undefined}
      // Honor OS Dynamic Type but cap the largest step so dense lists don't clip.
      maxFontSizeMultiplier={2}
    >
      {children}
    </Text>
  );
}
