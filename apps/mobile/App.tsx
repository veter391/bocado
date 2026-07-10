/**
 * App entry. Provider order matters:
 *   GestureHandlerRootView (native gestures must wrap everything)
 *     -> SafeAreaProvider (insets available app-wide)
 *       -> ThemeProvider (theme tokens via useTheme)
 *         -> ProfileProvider (on-device user profile)
 *           -> NavigationContainer (typed routes from RootStackParamList)
 *             -> RootNavigator
 *
 * Splash hold: the native splash declared in app.json stays up automatically
 * until the first frame renders. We hold that first frame back until the brand
 * fonts are ready (or fall back to the system font), so we never flash unstyled
 * text. We deliberately don't depend on expo-splash-screen (not in this package's
 * deps); returning null while loading keeps the native splash on screen.
 */
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { ThemeProvider } from '@/theme';
import { ProfileProvider } from '@/store/profile';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAppFonts } from '@/hooks/useAppFonts';

export default function App() {
  const ready = useAppFonts();

  // While not ready, render nothing so the native splash (app.json) stays up.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ProfileProvider>
            <NavigationContainer>
              <StatusBar style="auto" />
              <RootNavigator />
            </NavigationContainer>
          </ProfileProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
