/**
 * CaptureTray — the multi-page capture strip on the Scan screen (no new dependency
 * beyond expo-image, already used by DishCard).
 *
 * Multi-page capture: tapping the shutter (or picking from the library) adds a CLEANED
 * page image to this on-screen tray instead of analyzing immediately. The tray shows a
 * horizontal row of page thumbnails — each with a remove (×) control — a "Page N of MAX"
 * count, and the primary "Analyze (N)" button that runs perception over ALL pages in one
 * call. It is purely presentational: the screen owns the page list + the cap, passes the
 * pages down, and handles add/remove/analyze.
 *
 * Sits over the dark viewfinder, so it uses its own dark, high-contrast surface (matching
 * the camera-screen chrome, like the existing scrim/controls) rather than the cream paper
 * tokens used by the in-app sheets. The Analyze button uses the brand primary so it reads
 * as the one primary action once pages exist.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/useTheme';
import type { Theme } from '@/theme/tokens';

export interface CaptureTrayProps {
  /** The pending cleaned page images (data: URLs), in capture order. */
  pages: readonly string[];
  /** Max pages allowed; the count reads "N of max" and adding is disabled at the cap. */
  maxPages: number;
  /** Remove one page by index (retake / drop a bad photo). */
  onRemovePage: (index: number) => void;
  /** Run perception over ALL pages. Disabled while a scan is in flight. */
  onAnalyze: () => void;
  /** True while analyzing — disables the Analyze button so it can't double-fire. */
  analyzing: boolean;
}

export function CaptureTray({
  pages,
  maxPages,
  onRemovePage,
  onAnalyze,
  analyzing,
}: CaptureTrayProps): React.JSX.Element | null {
  const theme = useTheme();
  const styles = makeStyles(theme);

  if (pages.length === 0) return null;

  const atCap = pages.length >= maxPages;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Compact captured-pages strip — small thumbnails, never covers the viewfinder. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbs}
      >
        {pages.map((uri, index) => (
          <View key={`${index}-${uri.slice(-12)}`} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
            <PressableScale
              onPress={() => onRemovePage(index)}
              accessibilityRole="button"
              accessibilityLabel={`Remove page ${index + 1}`}
              style={styles.removeBtn}
            >
              <Icon name="X" size={12} color="#FFFFFF" />
            </PressableScale>
          </View>
        ))}
      </ScrollView>

      {/* One compact primary action — auto-width pill, centred, not a full-width bar. */}
      <PressableScale
        onPress={onAnalyze}
        disabled={analyzing}
        accessibilityRole="button"
        accessibilityLabel={`Analyze ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`}
        style={[
          styles.analyzeBtn,
          { backgroundColor: theme.color.primary, opacity: analyzing ? 0.6 : 1 },
        ]}
      >
        <Icon name="Sparkles" size={16} color={theme.color.onPrimary} />
        <AppText variant="label" color="onPrimary">
          {`Analyze ${pages.length}${atCap ? ' (max)' : ''}`}
        </AppText>
      </PressableScale>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: {
      gap: theme.spacing.sm,
      alignItems: 'center',
    },
    thumbs: {
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
    },
    thumbWrap: {
      width: 46,
      height: 60,
    },
    thumb: {
      width: 46,
      height: 60,
      borderRadius: theme.radius.rSm,
      backgroundColor: 'rgba(0,0,0,0.3)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.5)',
    },
    removeBtn: {
      position: 'absolute',
      top: -5,
      right: -5,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(30,27,24,0.92)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.6)',
    },
    // Auto-width: alignSelf center + only horizontal padding sizes it to its label.
    analyzeBtn: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      height: 44,
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.spacing.lg,
    },
  });
}
