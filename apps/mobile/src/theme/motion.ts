/**
 * Bocado motion system — see DESIGN.md §7.
 *
 * Every preset maps to a FUNCTIONAL animation (guides attention / teaches order /
 * confirms action), not decoration. Rules enforced here:
 *  - durations 150–300ms
 *  - ease-out entering, ease-in exiting (never linear)
 *  - transform + opacity only (drive with Reanimated on the UI thread)
 *  - max 2 animated elements per view (a guideline for screens, not enforced here)
 *  - ALWAYS gate through `motionDuration(...)` so reduced-motion collapses to instant
 */

export const duration = {
  micro: 150, // taps, toggles
  base: 220, // most transitions
  enter: 260, // entrance reveals
  slow: 300, // shared-element / sheet
} as const;

/** Cubic-bezier control points (pair with Reanimated `Easing.bezier(...)`). */
export const easing = {
  out: [0.16, 1, 0.3, 1], // ease-out — entering
  in: [0.4, 0, 1, 1], // ease-in — exiting
  inOut: [0.65, 0, 0.35, 1], // symmetric moves
} as const;

/** Per-item delay for staggered list reveals (DESIGN.md §7.3). */
export const stagger = { stepMs: 35, maxItems: 12 } as const;

/**
 * Returns the duration to use given the user's reduced-motion setting.
 * Pass `AccessibilityInfo.isReduceMotionEnabled()` result in.
 * Reduced motion => 0ms (instant), so transforms snap and only opacity/content remain.
 */
export function motionDuration(ms: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : ms;
}

export function staggerDelay(index: number, reduceMotion: boolean): number {
  if (reduceMotion) return 0;
  return Math.min(index, stagger.maxItems) * stagger.stepMs;
}

/** Named presets, each tied to its job in DESIGN.md §7. */
export const presets = {
  viewfinderLockOn: { d: duration.base, e: easing.out, job: 'frame guidance' },
  scanSweep: { d: duration.slow, e: easing.inOut, job: 'reading feedback' },
  resultsReveal: { d: duration.enter, e: easing.out, job: 'reading order + ranking' },
  dotSettle: { d: duration.base, e: easing.out, fromScale: 0.85, job: 'verdict attention' },
  bestMatchSweep: { d: duration.slow, e: easing.out, job: 'wayfinding: start here' },
  cardToDetail: { d: duration.slow, e: easing.inOut, job: 'spatial continuity' },
  estimateBarFill: { d: duration.enter, e: easing.out, job: 'communicate range/estimate' },
  allergenPulse: { d: duration.base, e: easing.inOut, job: 'calm attention, no alarm' },
  consentConfirm: { d: duration.micro, e: easing.out, job: 'deliberate consent' },
  skeletonCrossfade: { d: duration.base, e: easing.out, job: 'no layout jump' },
  navDirectional: { d: duration.base, e: easing.inOut, job: 'depth mental model' },
} as const;

export type MotionPreset = keyof typeof presets;

/**
 * Spring presets (design-v2 tactile micro-interactions). Springs are used where
 * a *physical* response is wanted — a press that gives under the finger, a check
 * badge that pops in. Feed straight into Reanimated `withSpring(to, springs.X)`.
 * Still transform/opacity only, still UI-thread, still reduced-motion-gated by
 * the caller (collapse to no transform / instant when reduced motion is on).
 *
 *  - `pressScale`  : pressIn shrink for any tappable surface (cards, options,
 *                    chips, buttons, scan button). Snappy, lightly damped. Use
 *                    `fromScale` as the pressed-in value, scale back to 1 on out.
 *  - `selectSpring`: stiffer, near-critically damped spring for the SELECTED
 *                    state — the chip/option background settle + the check badge
 *                    scale 0 -> 1. Crisp, no overshoot wobble.
 */
export const springs = {
  pressScale: { stiffness: 320, damping: 22, fromScale: 0.96 },
  selectSpring: { stiffness: 500, damping: 30 },
} as const;

export type SpringPreset = keyof typeof springs;
