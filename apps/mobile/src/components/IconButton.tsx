/**
 * IconButton — Direction A's rounded icon control (`.iconbtn`): a 42pt rounded
 * square of raised paper with a hairline border and soft shadow, holding a single
 * lucide glyph. It is the PROPER back affordance (replacing the bare chevron) and
 * also the header's save/secondary action.
 *
 * Tactile: it springs under the finger via `PressableScale` (scale 0.96), and is a
 * full >= 44pt hit target (the 42pt visual box + hitSlop). Screen-reader labelled.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/useTheme';
import type { Theme } from '@/theme/tokens';

export interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Glyph size in pt. Default 19 (A's back chevron). */
  iconSize?: number;
  /** Override the glyph color. Defaults to the theme text color. */
  color?: string;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  iconSize = 19,
  color,
}: IconButtonProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.btn}
    >
      <View pointerEvents="none">
        <Icon name={icon} size={iconSize} color={color ?? theme.color.text} />
      </View>
    </PressableScale>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    btn: {
      width: 42,
      height: 42,
      borderRadius: theme.radius.rSm,
      backgroundColor: theme.color.surfaceRaised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.color.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      ...theme.elevation.e1,
    },
  });
}
