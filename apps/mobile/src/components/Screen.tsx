/**
 * Screen — the page shell every screen sits inside. Provides the warm paper
 * background, safe-area insets (notch / status bar / home indicator) via
 * react-native-safe-area-context, the 20pt horizontal gutter, an optional header
 * rendered above the content, and optional scrolling content.
 *
 * Responsiveness (DESIGN.md §3): flex layout, no fixed content widths, safe
 * areas honored on every edge. Nothing pins to raw top:0.
 */
import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaperBackground } from './PaperBackground';
import { spacing } from '@/theme/tokens';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a vertical ScrollView. Default false. */
  scroll?: boolean;
  /** Optional header rendered above the (scrollable) content area. */
  header?: React.ReactNode;
  /** Apply the 20pt horizontal gutter to content. Default true. */
  padded?: boolean;
  /** Optional footer pinned below the content area (e.g. the detail CTA). */
  footer?: React.ReactNode;
}

export function Screen({
  children,
  scroll = false,
  header,
  padded = true,
  footer,
}: ScreenProps): React.JSX.Element {
  const contentPadding: StyleProp<ViewStyle> = {
    paddingHorizontal: padded ? spacing.lg : 0,
  };

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, contentPadding]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentPadding]}>{children}</View>
  );

  // The warm paper gradient + dot-grain sits UNDER the whole screen (both themes);
  // the SafeAreaView on top is transparent so the paper shows through every edge.
  return (
    <PaperBackground>
      <SafeAreaView style={styles.root}>
        {header ? <View style={styles.header}>{header}</View> : null}
        {body}
        {footer ? <View>{footer}</View> : null}
      </SafeAreaView>
    </PaperBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
});
