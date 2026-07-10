/**
 * Shared back affordance used in screen headers — Direction A's rounded icon
 * button (`.iconbtn`) with the chevron-left glyph, optionally followed by a small
 * back-context label (e.g. "Scan", the place name). Replaces the old bare chevron.
 *
 * Same prop contract as before (`onPress`, `label`) so existing callers are
 * untouched: `label` is the accessibility label AND, by default, the visible
 * back-context word. Pass `showLabel={false}` for an icon-only button.
 */
import { StyleSheet, View } from 'react-native';

import { AppText, IconButton } from '@/components';

export interface BackButtonProps {
  onPress: () => void;
  label: string;
  /** Show the back-context word beside the button (A's `.back-label`). Default true. */
  showLabel?: boolean;
  /** Visible word, if it should differ from the (spoken) accessibility `label`. */
  visibleLabel?: string;
}

export function BackButton({ onPress, label, showLabel = true, visibleLabel }: BackButtonProps) {
  return (
    <View style={styles.row}>
      <IconButton icon="ChevronLeft" onPress={onPress} accessibilityLabel={label} iconSize={19} />
      {showLabel ? (
        <AppText variant="label" color="textSoft" numberOfLines={1} style={styles.label}>
          {visibleLabel ?? label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  label: {
    flexShrink: 1,
  },
});
