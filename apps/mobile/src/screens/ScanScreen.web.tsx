/**
 * Web variant of the Scan screen (Metro resolves `.web.tsx` on web automatically).
 *
 * The live camera (react-native-vision-camera) has no web build, so the web
 * preview cannot capture a real photo. This screen keeps the brand framing and,
 * on tap, runs the data layer in MOCK mode (sample menu) and routes to Results —
 * so the rest of the app (results, dish detail, dots, estimates, allergens,
 * onboarding) is fully explorable in a browser. The native ScanScreen.tsx is the
 * real camera flow on iOS/Android.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mealContextForHour } from '@bocado/shared';
import { AppText, EmptyState, Icon, PaperBackground, PressableScale } from '@/components';
import { useTheme } from '@/theme';
import { useProfile } from '@/store/profile';
import { scanAndStore } from '@/data/menuService';
import type { RootStackScreenProps } from '@/navigation/types';

export function ScanScreen({ navigation }: RootStackScreenProps<'Scan'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    if (processing) return;
    setError(null);
    setProcessing(true);
    try {
      const result = await scanAndStore('data:image/jpeg;base64,WEB_PREVIEW_PLACEHOLDER', {
        locale: 'en',
        context: mealContextForHour(new Date().getHours()),
        profile,
      });
      // Web preview is always MOCK mode, so the result is always a menu; guard anyway.
      if (result.kind === 'menu') {
        navigation.navigate('Results', { menuId: result.menu.id });
      } else {
        setError("We couldn't load the sample menu. Try again.");
      }
    } catch {
      setError("We couldn't load the sample menu. Try again.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <PaperBackground style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText variant="display" color="primary">
          Bocado
        </AppText>
        <AppText variant="body" color="textSoft" style={styles.tagline}>
          Scan a menu. Know what to order.
        </AppText>
      </View>

      <View style={styles.center}>
        {/* Decorative viewfinder frame (static on web). */}
        <View style={[styles.frame, { borderColor: theme.color.hairline }]}>
          <View style={[styles.bracket, styles.tl, { borderColor: theme.color.primary }]} />
          <View style={[styles.bracket, styles.tr, { borderColor: theme.color.primary }]} />
          <View style={[styles.bracket, styles.bl, { borderColor: theme.color.primary }]} />
          <View style={[styles.bracket, styles.br, { borderColor: theme.color.primary }]} />
          <Icon name="ScanLine" size={48} color={theme.color.hairline} />
        </View>
        <AppText variant="caption" color="textSoft" style={styles.note}>
          Web preview — the camera runs on the phone. Tap to scan a sample menu.
        </AppText>
      </View>

      {error ? (
        <EmptyState
          variant="error"
          title="Something went wrong"
          message={error}
          actionLabel="Try again"
          onAction={runScan}
        />
      ) : null}

      <View style={[styles.controls, { bottom: insets.bottom + theme.spacing.xl }]}>
        <PressableScale
          onPress={() => navigation.navigate('Onboarding')}
          accessibilityRole="button"
          accessibilityLabel="Set up your profile"
          style={[styles.secondaryBtn, { backgroundColor: theme.color.surfaceDeep }]}
        >
          <Icon name="Settings" size={22} color={theme.color.text} />
        </PressableScale>

        <PressableScale
          onPress={runScan}
          disabled={processing}
          accessibilityRole="button"
          accessibilityLabel="Scan a sample menu"
          style={[
            styles.captureOuter,
            { borderColor: theme.color.primaryTint, opacity: processing ? 0.5 : 1 },
          ]}
        >
          <View style={[styles.captureInner, { backgroundColor: theme.color.primary }]}>
            <Icon name="Camera" size={28} color={theme.color.onPrimary} />
          </View>
        </PressableScale>

        <View style={styles.secondaryBtn} />
      </View>
    </PaperBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 24, alignItems: 'center' },
  tagline: { marginTop: 4, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  frame: {
    width: 220,
    height: 280,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracket: { position: 'absolute', width: 32, height: 32 },
  tl: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  tr: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  br: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  note: { marginTop: 20, textAlign: 'center', maxWidth: 280 },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 20,
  },
  secondaryBtn: { width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  captureOuter: {
    width: 76,
    height: 76,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  captureInner: { width: 60, height: 60, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
