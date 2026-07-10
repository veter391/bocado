/**
 * ProBadge — the small, reusable "Pro" affordance.
 *
 * Two shapes from one component:
 *   - variant="pill" (default): a tiny coral-tinted "Pro" chip, optionally with a
 *     lock glyph — use it inline next to a gated feature label.
 *   - variant="lock": just the lock glyph in a rounded coral-tinted square — the
 *     compact lock used in the dish-detail premium banner.
 *
 * Decorative by default (the surrounding pressable owns the label + a11y), so it
 * is hidden from the screen reader unless given its own `accessibilityLabel`.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/theme/useTheme';
import type { Theme } from '@/theme/tokens';

export type ProBadgeVariant = 'pill' | 'lock';

export interface ProBadgeProps {
  variant?: ProBadgeVariant;
  /** Show the lock glyph in the pill variant. The lock variant always shows it. */
  showLock?: boolean;
  /** Glyph size in pt for the lock variant. Default 17. */
  iconSize?: number;
}

export function ProBadge({
  variant = 'pill',
  showLock = false,
  iconSize = 17,
}: ProBadgeProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);

  if (variant === 'lock') {
    return (
      <View style={styles.lockBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="Lock" size={iconSize} color={theme.color.primary} />
      </View>
    );
  }

  return (
    <View style={styles.pill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {showLock ? <Icon name="Lock" size={12} color={theme.color.primary} /> : null}
      <AppText variant="caption" color="primary" style={styles.pillText}>
        Pro
      </AppText>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: theme.radius.full,
      backgroundColor: theme.color.primarySoft,
    },
    pillText: {
      fontSize: 11,
      letterSpacing: 0.4,
    },
    lockBox: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,111,94,0.18)',
    },
  });
}
