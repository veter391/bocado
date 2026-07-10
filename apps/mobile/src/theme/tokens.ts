/**
 * Bocado design tokens — single source of truth for the mobile UI.
 * Derived from BRANDING.md and DESIGN.md. Light + dark.
 *
 * Rule: components consume `theme.*`, never raw hex. Suitability colors are
 * semantic (good/caution/avoid) and must always be paired with an icon + label
 * in the UI — never color alone (accessibility).
 */

export type SuitabilityLevel = 'good' | 'caution' | 'avoid';

export const palette = {
  // Brand
  coral: '#FF6F5E',
  coralPressed: '#ED5A48',
  coralTint: '#FFE6E1', // light selection background
  onCoral: '#FFFFFF',
  // Selection pattern (design-v2): selected option/chip = tint bg + CORAL-toned
  // text (never light-on-light) + a filled coral check badge.
  // Light: deep coral text on the light coral tint — 4.70:1 (>= AA), and clearly
  // darker/less orange than the brand coral so it reads as "selected", not a button.
  coralDeep: '#B83E26',
  /** Direction A "coral-soft" wash — the brand-accent tint behind the "?" what-it-is
   *  glyph and the premium lock icon. Warmer/pinker than coralTint. */
  coralSoft: '#FFE7E1',

  // Paper (light) — the founder-approved Direction B warm textured paper.
  // `paper` is the BASE color of the B radial wash (PaperBackground paints the
  // gradient + corner accents + grain on top). Cards must read as a DISTINCT
  // lighter surface that lifts OFF this textured paper, so `paper2`/`surface`
  // are pushed to a near-white warm tone (B's solid card ~#FFFDF8) for clear
  // card↔background separation. `paper3` stays a warm recessed fill.
  // BACKGROUND = Direction B's LIGHT warm cream paper (PaperBackground paints B's
  // radial #FCF7EE->#FAF4E9->#F4EAD7 + a subtle grain texture on top). Cards are a
  // soft WARM cream that lifts gently off it. Founder rule: cards are warm cream,
  // NEVER cold/stark white; the textured cream paper is the background.
  paper: '#FAF4E9', // background base — B light cream
  paper2: '#FEFBF4', // raised CARD paper — warm soft cream (never cold white)
  paper3: '#EFE6D4', // recessed / hairline fills / ring track
  surface: '#FEFBF4', // card/sheet surface — warm cream
  surfaceDeep: '#F1E8D6',
  hairline: '#E6DAC2', // warm keyline so cream cards edge-separate from the textured paper
  ink: '#2A2723', // A's near-black warm ink
  inkSoft: '#6E665B', // A's secondary text
  // A's tertiary tier was #A89E8E (2.4:1 on paper — too faint for text). Darkened to
  // #7C7263 so captions/footnotes (incl. the legal estimate disclaimer) clear WCAG
  // AA-large on paper (4.3:1) and AA on cards (4.6:1), keeping the same warm-grey read.
  inkFaint: '#7C7263',

  // Paper (dark) — a WARM dark variant of A's ramp (espresso paper, not slate).
  paperDark: '#1B1815',
  paper2Dark: '#262220', // raised card paper, dark
  paper3Dark: '#332D28', // recessed / ring track, dark
  surfaceDark: '#262220',
  surfaceDeepDark: '#332D28',
  hairlineDark: '#3A332D',
  inkDark: '#F3ECE0',
  inkSoftDark: '#B3A998',
  inkFaintDark: '#8A8073', // tertiary / captions, dark
  coralDark: '#FF7A6A',
  // Dark selection tint — a warm, low-lightness coral-brown so it is NOT a light
  // pink in dark mode (root cause of the invisible-text bug). coralDark text on
  // this tint is 5.35:1 (>= AA).
  coralTintDark: '#3A2A27',
  coralSoftDark: '#3A2A27',

  // Suitability (semantic) — light. Aligned to Direction A's traffic-light hues.
  good: '#3FAE6B', // A's --good
  goodSoft: '#E1F2E7', // A's --good-soft
  // A's vw-good text (#2C7D4D) was 4.35:1 on the soft tint — just shy of AA for the
  // small pill text. Nudged darker to #267145 (5.1:1) while staying the same green.
  goodText: '#267145',
  caution: '#E0982E',
  cautionSoft: '#FBEFD6', // A's --warn-soft
  // A's vw-warn text (#9A6B12) was 4.11:1; darkened to #855A0E (5.3:1) for AA.
  cautionText: '#855A0E',
  avoid: '#DE4B3B', // A's --bad — warmer/deeper than coral so they don't clash
  avoidSoft: '#FBE3DF', // A's --bad-soft
  avoidText: '#B03224', // AA-dark red text on avoidSoft (A's vw-bad color)
  // Suitability — dark. Brighter glyph hues for contrast on espresso paper; the
  // *-Soft tints are warm low-lightness washes, and *-Text are the bright hues
  // themselves (high contrast on a dark wash, never dark-on-dark).
  goodDark: '#56C98C',
  goodSoftDark: '#1F3A2C',
  goodTextDark: '#7FD9A6',
  cautionDark: '#EFB84F',
  cautionSoftDark: '#3A2F18',
  cautionTextDark: '#F2C66E',
  avoidDark: '#F06A5B',
  avoidSoftDark: '#3A211C',
  avoidTextDark: '#F58A7C',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20, // screen gutter
  xl: 24, // section gap
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
  // Direction A's named card radii (r-sm / r-md / r-lg). Kept ALONGSIDE the legacy
  // scale so existing consumers are untouched; new A components use these.
  rSm: 14, // small controls, thumbs, icon buttons
  rMd: 20, // list rows, what-it-is / premium cards
  rLg: 26, // the big "Nutrient lights" + ingredients cards
} as const;

export const zIndex = {
  base: 0,
  card: 10,
  sticky: 20,
  sheet: 30,
  toast: 40,
  modal: 50,
} as const;

/**
 * Typography — design-v2: ONE clean premium family, Plus Jakarta Sans, mapped
 * by weight. No serif. Family keys MUST match `theme/fonts.ts` `fontMap` keys
 * exactly (AppText sets `fontFamily` to these strings).
 *
 *   display  -> ExtraBold  (screen titles, dish names) — confident, premium
 *   title    -> SemiBold    (section headers)
 *   body     -> Regular     (descriptions) — stays >= 16pt
 *   label    -> Medium      (dot labels, chips, buttons)
 *   caption  -> Regular     ("estimate", attributions, hints)
 *   data     -> Medium + tabular figures (kcal/macros align)
 *
 * `tracking` (letterSpacing, pt) is provided for tracking-tight headings/data;
 * AppText applies it. Jakarta is geometric so large headings read best slightly
 * tightened.
 */
export const typography = {
  display: { family: 'Jakarta-ExtraBold', size: 28, lineHeight: 34, tracking: -0.5 },
  title: { family: 'Jakarta-SemiBold', size: 20, lineHeight: 26, tracking: -0.3 },
  body: { family: 'Jakarta', size: 16, lineHeight: 24, tracking: 0 },
  label: { family: 'Jakarta-Medium', size: 14, lineHeight: 20, tracking: 0 },
  caption: { family: 'Jakarta', size: 13, lineHeight: 18, tracking: 0 },
  data: {
    family: 'Jakarta-Medium',
    size: 16,
    lineHeight: 20,
    tracking: -0.2,
    fontVariant: ['tabular-nums'] as const,
  },
} as const;

export const minTouchTarget = 44; // pt, accessibility hard floor

type Elevation = { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };

const lightElevation: Record<'e1' | 'e2', Elevation> = {
  e1: { shadowColor: '#2A2622', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  e2: { shadowColor: '#2A2622', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
};

export interface ThemeColor {
  primary: string;
  primaryPressed: string;
  primaryTint: string;
  onPrimary: string;
  /**
   * Selected-option/chip background (design-v2 selection pattern). Theme-aware:
   * a light coral tint in light mode, a warm coral-brown in dark mode (so it is
   * NEVER a light pink behind text in the dark theme).
   */
  selectedTint: string;
  /**
   * Text/icon color for the SELECTED state, drawn on `selectedTint`. Coral-toned
   * and verified >= 4.5:1 on its tint in both themes. Use this for the label of a
   * selected chip/option — never `onPrimary` (which would be light-on-light).
   */
  selectedText: string;
  /** Direction A brand-accent wash (behind the "?" what-it-is glyph, lock icon). */
  primarySoft: string;
  background: string;
  surface: string;
  surfaceDeep: string;
  hairline: string;
  text: string;
  textSoft: string;
  /** Tertiary text tier (captions / footnotes / chevrons) — A's `--ink-faint`. */
  textFaint: string;
  /**
   * Direction A paper ramp. `surfaceRaised` = raised card paper (A `--paper-2`),
   * `surfaceRecessed` = recessed fills / progress-bar + verdict-ring TRACK
   * (A `--paper-3`). Theme-aware (warm-light in light, espresso in dark).
   */
  surfaceRaised: string;
  surfaceRecessed: string;
  good: string;
  caution: string;
  avoid: string;
  /**
   * Soft tints + AA-verified ON-tint text for each suitability level — the verdict
   * "word pill" and the per-nutrient tag. `*Soft` is the pill background, `*Text`
   * is the label color drawn on it (contrast verified in BOTH themes; see header).
   */
  goodSoft: string;
  goodText: string;
  cautionSoft: string;
  cautionText: string;
  avoidSoft: string;
  avoidText: string;
}

export interface Theme {
  mode: 'light' | 'dark';
  color: ThemeColor;
  elevation: Record<'e1' | 'e2', Elevation>;
  spacing: typeof spacing;
  radius: typeof radius;
  zIndex: typeof zIndex;
  typography: typeof typography;
}

const lightTheme: Theme = {
  mode: 'light',
  color: {
    primary: palette.coral,
    primaryPressed: palette.coralPressed,
    primaryTint: palette.coralTint,
    onPrimary: palette.onCoral,
    selectedTint: palette.coralTint,
    selectedText: palette.coralDeep,
    primarySoft: palette.coralSoft,
    background: palette.paper,
    surface: palette.surface,
    surfaceDeep: palette.surfaceDeep,
    hairline: palette.hairline,
    text: palette.ink,
    textSoft: palette.inkSoft,
    textFaint: palette.inkFaint,
    surfaceRaised: palette.paper2,
    surfaceRecessed: palette.paper3,
    good: palette.good,
    caution: palette.caution,
    avoid: palette.avoid,
    goodSoft: palette.goodSoft,
    goodText: palette.goodText,
    cautionSoft: palette.cautionSoft,
    cautionText: palette.cautionText,
    avoidSoft: palette.avoidSoft,
    avoidText: palette.avoidText,
  },
  elevation: lightElevation,
  spacing,
  radius,
  zIndex,
  typography,
};

const darkTheme: Theme = {
  mode: 'dark',
  color: {
    primary: palette.coralDark,
    primaryPressed: palette.coralPressed,
    primaryTint: palette.coralTintDark,
    onPrimary: palette.onCoral,
    selectedTint: palette.coralTintDark,
    selectedText: palette.coralDark,
    primarySoft: palette.coralSoftDark,
    background: palette.paperDark,
    surface: palette.surfaceDark,
    surfaceDeep: palette.surfaceDeepDark,
    hairline: palette.hairlineDark,
    text: palette.inkDark,
    textSoft: palette.inkSoftDark,
    textFaint: palette.inkFaintDark,
    surfaceRaised: palette.paper2Dark,
    surfaceRecessed: palette.paper3Dark,
    good: palette.goodDark,
    caution: palette.cautionDark,
    avoid: palette.avoidDark,
    goodSoft: palette.goodSoftDark,
    goodText: palette.goodTextDark,
    cautionSoft: palette.cautionSoftDark,
    cautionText: palette.cautionTextDark,
    avoidSoft: palette.avoidSoftDark,
    avoidText: palette.avoidTextDark,
  },
  elevation: {
    e1: { ...lightElevation.e1, shadowColor: '#000000', shadowOpacity: 0.3 },
    e2: { ...lightElevation.e2, shadowColor: '#000000', shadowOpacity: 0.45 },
  },
  spacing,
  radius,
  zIndex,
  typography,
};

export const themes: { light: Theme; dark: Theme } = { light: lightTheme, dark: darkTheme };

// --- Semantic color helpers --------------------------------------------------

/** A solid + soft + on-soft-text triple for one traffic-light hue. */
export interface VerdictColors {
  /** Solid glyph color (the dot fill, ring stroke). */
  solid: string;
  /** Soft pill/tag background. */
  soft: string;
  /** AA-verified text/label color drawn on `soft`. */
  text: string;
}

/**
 * Resolve the solid/soft/on-soft colors for a dish-level suitability verdict
 * (good/caution/avoid) from the active theme. The single place the verdict ring,
 * the list "verdict word" pill, and the hero use to stay consistent.
 */
export function verdictColors(theme: Theme, level: SuitabilityLevel): VerdictColors {
  switch (level) {
    case 'good':
      return { solid: theme.color.good, soft: theme.color.goodSoft, text: theme.color.goodText };
    case 'caution':
      return { solid: theme.color.caution, soft: theme.color.cautionSoft, text: theme.color.cautionText };
    case 'avoid':
      return { solid: theme.color.avoid, soft: theme.color.avoidSoft, text: theme.color.avoidText };
  }
}

/**
 * Resolve colors for a per-nutrient traffic-light level (good/caution/high).
 * `high` maps to the AVOID (red) hue, `caution` to amber, `good` to green — the
 * Direction A mapping used by the "Nutrient lights" card.
 */
export function nutrientColors(
  theme: Theme,
  level: 'good' | 'caution' | 'high',
): VerdictColors {
  if (level === 'high') {
    return { solid: theme.color.avoid, soft: theme.color.avoidSoft, text: theme.color.avoidText };
  }
  if (level === 'caution') {
    return { solid: theme.color.caution, soft: theme.color.cautionSoft, text: theme.color.cautionText };
  }
  return { solid: theme.color.good, soft: theme.color.goodSoft, text: theme.color.goodText };
}
