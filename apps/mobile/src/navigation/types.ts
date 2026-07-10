/**
 * Typed route params for the root native stack.
 * Import where you call navigation so every navigate/route is fully typed.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Onboarding: undefined;
  Scan: undefined;
  Results: { menuId: string };
  DishDetail: { menuId: string; dishId: string };
  /** Pro upsell, presented modally over the current screen. */
  Paywall: undefined;
};

/** Per-screen prop helper, e.g. `RootStackScreenProps<'Results'>`. */
export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

/**
 * Make the typed param list the default for the untyped `useNavigation()` etc.
 * (React Navigation global type augmentation.)
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
