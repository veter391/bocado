/**
 * Root native-stack navigator (DESIGN.md §7.11 — directional nav: deeper screens
 * slide in from the right to build a spatial sense of depth).
 *
 * The slide animation is native (native-stack on the OS), gated by the user's
 * reduced-motion setting: when reduce motion is on we drop to a plain fade so
 * there is no large translate — consistent with `motion.motionDuration` collapsing
 * transforms to instant elsewhere.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { useTheme } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { EntitlementProvider } from '@/store/entitlement';
import { RemindersProvider } from '@/store/reminders';
import { SavedDishesProvider } from '@/store/savedDishes';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { ScanScreen } from '@/screens/ScanScreen';
import { ResultsScreen } from '@/screens/ResultsScreen';
import { DishDetailScreen } from '@/screens/DishDetailScreen';
import { PaywallScreen } from '@/screens/PaywallScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * The app-scoped context providers are wired HERE rather than in App.tsx — App.tsx is
 * intentionally left untouched (same stance as the entitlement provider). They sit
 * inside the existing app-wide providers (theme/profile) and ABOVE the navigator, so
 * every screen and bottom-sheet can read their hooks (the hooks throw outside their
 * provider, like `useProfile`/`useEntitlement`):
 *   - EntitlementProvider — FREE vs PRO, read by the Paywall + dish detail.
 *   - RemindersProvider   — the opt-in daily-reminder flag, read by the Settings toggle.
 *   - SavedDishesProvider — on-device bookmarks, read by the dish bookmark + history sheet.
 */
export function RootNavigator() {
  return (
    <EntitlementProvider>
      <RemindersProvider>
        <SavedDishesProvider>
          <RootStack />
        </SavedDishesProvider>
      </RemindersProvider>
    </EntitlementProvider>
  );
}

function RootStack() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const screenOptions: NativeStackNavigationOptions = {
    headerShown: false,
    contentStyle: { backgroundColor: theme.color.background },
    // navDirectional: deeper screens slide from the right; reduced motion -> fade.
    animation: reduceMotion ? 'fade' : 'slide_from_right',
    animationDuration: reduceMotion ? 0 : undefined,
    gestureEnabled: true,
    // Freeze off-screen screens (react-native-screens) so the stacked Scan screen —
    // and its camera — stop doing React work while Results/DishDetail are on top.
    freezeOnBlur: true,
  };

  return (
    <Stack.Navigator initialRouteName="Scan" screenOptions={screenOptions}>
      {/* Onboarding is presented as a modal-ish push from Scan; works without it. */}
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Scan" component={ScanScreen} />
      <Stack.Screen name="Results" component={ResultsScreen} />
      <Stack.Screen name="DishDetail" component={DishDetailScreen} />
      {/* Pro upsell — presented modally (slides up) over whatever is below it. */}
      <Stack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{ presentation: 'modal', animation: reduceMotion ? 'fade' : 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
