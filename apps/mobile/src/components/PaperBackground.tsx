/**
 * PaperBackground — the warm "paper" surface every Bocado screen sits on.
 *
 * It is the BACKGROUND the founder chose from Direction B (warm-editorial), laid
 * under Direction A's UI. Direction B's paper is NOT a flat beige and NOT a plain
 * vertical wash — it is a soft TOP radial that lightens the head of the screen,
 * warm corner radial ACCENTS, and a faint dot-grain so the surface reads like
 * printed paper. Both themes are first-class:
 *
 *   - light (the founder-loved B paper):
 *       · base radial, top-center:  #FCF7EE → #FAF4E9 → #F4EAD7
 *       · warm corner accent, top:        #F0E2C6 (fades out by ~60%)
 *       · warm corner accent, bottom-rt:  #EADDBF (fades out by ~55%)
 *       · faint warm dot-grain (rgba(120,100,60,.05), 4px/7px tiles)
 *     Cards/list surfaces (`theme.color.surfaceRaised`) are a near-white warm
 *     tone, so they LIFT cleanly off this textured paper — verified in tokens.
 *   - dark : a warm espresso vertical ramp derived from A's dark paper
 *       (#211D19 → #1B1815 → #15120F), faint warm-light grain. Unchanged.
 *
 * Implementation:
 *   - react-native-svg paints the radial wash + corner accents (RN's
 *     expo-linear-gradient can't do radials, and B's paper is radial). Dark mode
 *     keeps its simple vertical ramp via expo-linear-gradient.
 *   - A <Pattern> of tiny circles draws the dot-grain, tiled across the whole
 *     surface at low opacity (B's 4px/7px grain). `pointerEvents="none"` so the
 *     decoration never intercepts touches.
 *
 * Purely decorative and static (no animation) — safe under reduced motion with
 * no special handling. Children render above all layers.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useTheme } from '@/theme/useTheme';

export interface PaperBackgroundProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** The DARK vertical paper ramp (top -> bottom). Warm espresso, never slate. */
const DARK_GRADIENT: readonly [string, string, string] = ['#211D19', '#1B1815', '#15120F'];

/** Dot-grain color + opacity per theme (kept very faint — texture, not pattern). */
const GRAIN: Record<'light' | 'dark', { color: string; opacity: number }> = {
  // Light grain is intentionally VISIBLE — the founder wants a real "rough paper"
  // texture on the background (cards sit on top as clean warm-beige panels).
  light: { color: '#9A8050', opacity: 0.06 },
  dark: { color: '#FFF4E2', opacity: 0.04 },
};

/**
 * Light = Direction B's warm textured paper, painted with SVG radials so the
 * top-center wash + warm corner accents match B faithfully.
 */
function LightPaper(): React.JSX.Element {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%">
      <Defs>
        {/* B's .screen base radial: top-center lighter -> paper -> paper-2. */}
        <RadialGradient id="paperBase" cx="50%" cy="0%" r="120%">
          <Stop offset="0" stopColor="#FCF7EE" />
          <Stop offset="0.42" stopColor="#FAF4E9" />
          <Stop offset="1" stopColor="#F4EAD7" />
        </RadialGradient>
        {/* B's body top corner accent: warm sand glow at the head, fades by ~60%. */}
        <RadialGradient id="paperTopAccent" cx="50%" cy="-8%" r="95%">
          <Stop offset="0" stopColor="#F0E2C6" stopOpacity={0.9} />
          <Stop offset="0.6" stopColor="#F0E2C6" stopOpacity={0} />
        </RadialGradient>
        {/* B's body bottom-right corner accent, fades by ~55%. */}
        <RadialGradient id="paperBottomAccent" cx="88%" cy="108%" r="120%">
          <Stop offset="0" stopColor="#EADDBF" stopOpacity={0.85} />
          <Stop offset="0.55" stopColor="#EADDBF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#paperBase)" />
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#paperTopAccent)" />
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#paperBottomAccent)" />
    </Svg>
  );
}

export function PaperBackground({ children, style }: PaperBackgroundProps): React.JSX.Element {
  const theme = useTheme();
  const grain = GRAIN[theme.mode];

  return (
    <View style={[styles.root, style]}>
      {theme.mode === 'light' ? (
        <LightPaper />
      ) : (
        <LinearGradient
          colors={[...DARK_GRADIENT]}
          locations={[0, 0.42, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Faint dot-grain. Two interleaved circle sizes (B's 4px/7px grain). */}
      <Svg
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        // The pattern tiles itself; width/height 100% covers the whole surface.
        width="100%"
        height="100%"
      >
        <Defs>
          <Pattern
            id="paperGrain"
            patternUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={6}
            height={6}
          >
            <Circle cx={1} cy={1} r={0.9} fill={grain.color} opacity={grain.opacity} />
            <Circle cx={4} cy={3.5} r={0.75} fill={grain.color} opacity={grain.opacity * 0.85} />
            <Circle cx={2.5} cy={5} r={0.5} fill={grain.color} opacity={grain.opacity * 0.6} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#paperGrain)" />
      </Svg>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
