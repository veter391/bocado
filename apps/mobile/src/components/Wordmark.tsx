/**
 * Wordmark — the in-app "bocado" brand MARK.
 *
 * Direction: the founder disliked the little red dot beside "bocado" in the
 * Results header, so this turns the plain word into a tasteful, minimal logo
 * treatment — NOT a separate icon:
 *   - the word "bocado" in CORAL (`theme.color.primary`), Plus Jakarta ExtraBold
 *   - the dot REMOVED
 *   - tight NEGATIVE letterspacing so the letters knit into a single mark
 *   - a refined coral KEYLINE underneath, inset and slightly thicker than a
 *     hairline, sitting just under the baseline — a premium, restrained detail
 *     that reads as a logo lockup rather than a label.
 *
 * Purely static (no animation), so it is reduced-motion safe with no special
 * handling. A `size` prop scales the cap height; the keyline + tracking scale
 * with it so the mark stays balanced at any size.
 *
 * Accessibility: the whole mark is exposed as a single image labelled "bocado"
 * so screen readers announce the brand once, not letter-by-letter.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/useTheme';

export interface WordmarkProps {
  /** Cap height of the wordmark in pt. Default 16 (the Results header size). */
  size?: number;
  /** Optional override for the mark color; defaults to `theme.color.primary` (coral). */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_SIZE = 16;

export function Wordmark({ size = DEFAULT_SIZE, color, style }: WordmarkProps): React.JSX.Element {
  const theme = useTheme();
  const mark = color ?? theme.color.primary;

  const composed = useMemo(() => {
    // Tracking and keyline scale with the type size so the mark stays balanced.
    const letterSpacing = -size * 0.045; // tight negative tracking — knits the word
    const keylineHeight = Math.max(StyleSheet.hairlineWidth, size * 0.085);
    const keylineInset = size * 0.06; // pull the keyline in from each edge
    const keylineGap = Math.max(1, size * 0.12); // breathing room under the baseline
    return {
      word: {
        fontFamily: 'Jakarta-ExtraBold',
        fontSize: size,
        lineHeight: size * 1.02,
        letterSpacing,
        color: mark,
      } as const,
      keyline: {
        height: keylineHeight,
        borderRadius: keylineHeight,
        marginTop: keylineGap,
        marginHorizontal: keylineInset,
        backgroundColor: mark,
      } as const,
    };
  }, [size, mark]);

  return (
    <View
      style={[styles.root, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="bocado"
    >
      <Text
        style={composed.word}
        // Wordmark is fixed brand sizing — do not let Dynamic Type distort the mark.
        allowFontScaling={false}
      >
        bocado
      </Text>
      <View style={composed.keyline} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'stretch',
  },
});
