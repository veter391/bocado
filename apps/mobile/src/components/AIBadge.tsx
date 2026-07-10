/**
 * AIBadge — the visible "AI illustration" label required on every generated
 * image (SECURITY.md §2.C, AI Act Art. 50; copy from AI_IMAGE_LABEL). Must be a
 * clear, legible pill — never a faint footer or ToS clause.
 *
 * Designed to be overlaid on a corner of an AI image (caller positions it).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AI_IMAGE_LABEL } from '@bocado/shared';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/tokens';

export function AIBadge(): React.JSX.Element {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={AI_IMAGE_LABEL}
      style={[styles.pill, { backgroundColor: theme.color.surface, borderColor: theme.color.hairline }]}
    >
      <Icon name="Sparkles" size={12} color={theme.color.textSoft} />
      <AppText variant="caption" color="textSoft" style={styles.label} numberOfLines={1}>
        {AI_IMAGE_LABEL}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    marginLeft: 4,
  },
});
