/**
 * Brand font map for the theme layer.
 *
 * design-v2: ONE clean premium family — **Plus Jakarta Sans** — replaces the old
 * Fraunces serif + Inter. No serif anywhere. Each typography *family key* used in
 * `theme/tokens.ts` (and consumed by `AppText`) maps to a concrete weight asset:
 *
 *   'Jakarta-ExtraBold' -> Plus Jakarta Sans 800 ExtraBold  (display)
 *   'Jakarta-Bold'      -> Plus Jakarta Sans 700 Bold       (display alt / titles)
 *   'Jakarta-SemiBold'  -> Plus Jakarta Sans 600 SemiBold   (titles / strong)
 *   'Jakarta-Medium'    -> Plus Jakarta Sans 500 Medium     (labels, chips, buttons)
 *   'Jakarta'           -> Plus Jakarta Sans 400 Regular     (body / caption / data)
 *
 * The KEYS here MUST stay byte-for-byte identical to `typography.*.family`,
 * because `AppText` sets `fontFamily` to those exact strings. If a key drifts,
 * React Native silently falls back to the system font for that variant.
 *
 * `useAppFonts` passes this object straight to expo-font's `useFonts`.
 *
 * @see ./tokens.ts (typography) — source of truth for the family keys.
 * @see ../hooks/useAppFonts.ts — the loader that consumes this map.
 */
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

/**
 * The expo-font `useFonts` map, keyed by the brand family names that the
 * typography tokens reference. Frozen so callers can't mutate the registry.
 */
export const fontMap = {
  Jakarta: PlusJakartaSans_400Regular,
  'Jakarta-Medium': PlusJakartaSans_500Medium,
  'Jakarta-SemiBold': PlusJakartaSans_600SemiBold,
  'Jakarta-Bold': PlusJakartaSans_700Bold,
  'Jakarta-ExtraBold': PlusJakartaSans_800ExtraBold,
} as const;

/** The set of family keys this app loads — handy for typing/assertions. */
export type FontFamilyKey = keyof typeof fontMap;

/**
 * Re-export the loader hook so the theme barrel (`@/theme`) keeps exposing
 * `useAppFonts` from this module. The implementation lives in
 * `@/hooks/useAppFonts`; this file owns only the font *registry*.
 */
export { useAppFonts } from '@/hooks/useAppFonts';
