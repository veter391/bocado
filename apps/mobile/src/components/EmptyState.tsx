/**
 * EmptyState — friendly, plain-language empty + error states in one component
 * (DESIGN.md §5). Grandma-readable copy, a lucide glyph chosen by variant, and
 * one optional clear action.
 *   variant 'empty'  -> calm, neutral (e.g. "Nothing here").
 *   variant 'error'  -> still calm, no alarm-red panic (e.g. couldn't read photo).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/useTheme';
import { minTouchTarget, radius, spacing } from '@/theme/tokens';

export interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'empty' | 'error';
}

const ICON_BY_VARIANT: Record<NonNullable<EmptyStateProps['variant']>, IconName> = {
  empty: 'Inbox',
  error: 'TriangleAlert',
};

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  variant = 'empty',
}: EmptyStateProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <View style={styles.root} accessible accessibilityRole="summary">
      <View style={[styles.iconWrap, { backgroundColor: theme.color.surfaceDeep }]}>
        <Icon name={ICON_BY_VARIANT[variant]} size={28} color={theme.color.textSoft} />
      </View>

      <AppText variant="title" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="body" color="textSoft" style={styles.message}>
        {message}
      </AppText>

      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={[styles.action, { backgroundColor: theme.color.primary }]}
        >
          <AppText variant="label" color="onPrimary" numberOfLines={1}>
            {actionLabel}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    minHeight: minTouchTarget,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
});
