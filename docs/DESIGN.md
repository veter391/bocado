# DESIGN SYSTEM

> Mobile-first design system for the Bocado Expo app. Built on [BRANDING.md](BRANDING.md) tokens.
> Direction: calm Yuka-like minimalism — NOT the generic "vibrant landing" the auto-recommender
> suggested (rejected: it fights the product's trust/calm goal). Reference best-practices pulled
> from the ui-ux-pro-max skill (RN + UX/animation guidelines) are folded in below.

## 1. Principles

1. **One job per screen.** Scan. See the list. See a dish. Set your profile. Never more.
2. **Glance, then dig.** The answer (suitability dot + name + kcal range) is readable in <1s; detail
   is one tap away, never upfront.
3. **Grandma-readable.** Short, plain sentences. No jargon, no fluff. "Heavy for the evening",
   not "high caloric density relative to circadian metabolic context".
4. **Calm, warm, honest.** Paper background, one coral accent, no alarm-red panic, estimates shown
   as estimates.
5. **Motion that teaches.** Every animation has a job (see §7). Max 1–2 animated elements per view.

## 2. Foundations (extends BRANDING.md)

### Spacing scale (4pt base)
`4, 8, 12, 16, 20, 24, 32, 40, 48`. Screen gutter = 20. Card padding = 16. Section gap = 24.

### Radius
`sm 8` (chips), `md 14` (inputs/buttons), `lg 20` (cards), `xl 28` (sheets), `full` (dots/avatars).

### Elevation (warm, soft — no harsh shadows on paper)
- `e0` flat (on paper)
- `e1` card: y2 blur 12 rgba(42,38,34,0.06)
- `e2` sheet/FAB: y6 blur 24 rgba(42,38,34,0.10)

### Touch & hit targets
Minimum **44×44pt** for every interactive element (UX critical). Primary scan button ≥ 64pt.

### Z-index scale
`base 0, card 10, sticky 20, sheet 30, toast 40, modal 50`.

## 3. Responsiveness (all phones, no overflow — hard requirement)

- Layout in **flex + percentage/auto**, never fixed pixel widths for content blocks.
- **Fluid type** via a clamp helper: scale body 15→17pt across 320→430pt device widths.
- **Safe areas** respected on every screen (`react-native-safe-area-context`): notch, home
  indicator, status bar. Nothing pinned to raw `top:0`.
- **Min device target 320pt wide** (iPhone SE 1st gen / small Android) → test at 320, 375, 390,
  430. No horizontal scroll, ever.
- Long dish names **wrap to 2 lines then ellipsize**; cards grow vertically, never clip.
- Lists use **FlashList** (recycler) so 100+ dish menus stay smooth.
- Dynamic Type / OS font scaling supported; layouts reflow, no clipping at 200% text.

## 4. Typography

| Role | Font | Size / line-height | Use |
|------|------|--------------------|-----|
| Display | **Fraunces** (alt: Playfair Display) | 28/34 | screen titles, dish names in detail |
| Title | Fraunces | 20/26 | section headers |
| Body | **Inter** (alt: Karla) | 16/24 | descriptions, explanations |
| Label | Inter Medium | 14/20 | dot labels, chips, buttons |
| Caption | Inter | 13/18 | "estimate", attributions, hints |
| Data | Inter **tabular** | 16/20 | kcal, macros (aligned columns) |

Body min **16pt** on mobile (UX rule). Line length naturally constrained by phone width. System
font fallback (SF Pro / Roboto) if a brand font fails — never block first render.

## 5. Component inventory

- **ScanButton** — the hero FAB (coral, ≥64pt, label "Scan menu").
- **DishCard** — row: suitability dot + label, dish name (translated), kcal range, lazy thumbnail,
  chevron. Whole row tappable (44pt+).
- **SuitabilityDot** — `good/caution/avoid` color + **icon + one-word label** (never color alone).
- **EstimateBar** — horizontal range bar for nutrition, with a clear "~ estimate" tag.
- **AllergenChip** — neutral chip "may contain X", with "confirm with staff" caption. Not red-alarm.
- **Sheet** — bottom sheet for dish detail / filters.
- **ConsentToggle** — deliberate, affirmative toggle for Art. 9 allergy consent.
- **Skeleton** — shimmer placeholders sized to final content (no layout jump).
- **AIBadge** — "AI illustration" label overlaid on generated images (compliance + honesty).
- **EmptyState / ErrorState** — friendly, plain-language, with one clear action.

## 6. Screens

### A. Scan
- Full-bleed camera with an animated **viewfinder frame**. Single primary action (capture).
- Helper line: "Point at the menu. Hold steady." Disappears once framed.
- After capture → morph into processing state (see §7.2). Manual "choose photo" secondary.

### B. Results (scanned menu)
- Sticky compact header: restaurant/menu title + active context (e.g. "Dinner · your profile").
- **FlashList** of `DishCard`, ranked best-first. Filter/sort chips (time, diet) scroll horizontally.
- Each card: dot+label, name, kcal range, thumbnail (lazy). Tap → detail.
- Empty/low-confidence → "Couldn't read this clearly — retake?" with retake action.

### C. Dish detail (bottom sheet or full screen)
- Header: dish name (Fraunces) + suitability dot + AI illustration (badged) if present.
- Plain explanation ("What it is"), key ingredients (decoded), **EstimateBar** nutrition with
  "~ estimate" tag + source attribution (CIQUAL/USDA), **AllergenChip**s with "confirm with staff".
- Never the word "safe". Never a hard calorie number.

### D. Onboarding / profile (allergy & diet)
- Progressive, one question per step (diet, allergies, goals) — skippable; app works without it.
- Allergy/health step gated behind an explicit, unbundled **ConsentToggle** ("Store my allergies
  on this device to personalize results"). Plain explanation of why + that it stays on-device.

## 7. Functional animation system (the core ask)

Rule: **every animation does a job** — it guides attention, teaches order, or confirms an action.
All: **150–300ms**, **ease-out entering / ease-in exiting** (never linear), **transform + opacity
only** (Reanimated on the UI thread), **respect reduced-motion** (degrade to instant or opacity-only),
**≤2 animated elements per view**.

| # | Motion | The job it does |
|---|--------|-----------------|
| 7.1 | **Viewfinder lock-on** — corner brackets ease inward and "snap" when a menu is framed | Teaches the user to frame correctly → fewer blurry scans |
| 7.2 | **Capture → scan sweep** — a soft light line sweeps the frozen photo | Says "I'm reading it", sets wait expectation, removes anxiety |
| 7.3 | **Staggered results reveal** — cards fade+rise top→bottom, ~35ms apart | Teaches reading order; signals top = best match |
| 7.4 | **Dot settle** — suitability dot scales 0.85→1 + slight saturation rise on entry | Pulls the eye to the verdict first; consistent position trains the glance |
| 7.5 | **Best-match sweep** — one-time gentle highlight on the top dish | Wayfinding: "start here" |
| 7.6 | **Card → detail shared element** — card image+title morph into the detail header | Spatial continuity: user knows where they came from and how back works |
| 7.7 | **Estimate bar fill** — range bar grows left→right to its band | Communicates "range / estimate", not a fixed truth |
| 7.8 | **Allergen pulse** — one calm attention pulse on "may contain" chips | Ensures it's noticed, without alarm |
| 7.9 | **Consent confirm** — weighted toggle + check morph | Makes the affirmative legal consent feel deliberate |
| 7.10 | **Skeleton → crossfade** — lazy thumbnails fade in over reserved space | No layout jump (content-jumping UX rule) |
| 7.11 | **Directional nav** — deeper screens slide from the right | Builds a spatial mental model of depth |

## 8. Accessibility (non-negotiable)

- Contrast ≥ 4.5:1 for text on paper and on coral (verify `ink-soft` on `paper`).
- **Color never the only signal** — dot always pairs with icon + word.
- 44×44pt min targets; visible focus/selection states.
- Screen-reader labels for the dot ("Good choice now", "Best avoided now") and for estimate ranges.
- Dynamic Type supported; `prefers-reduced-motion` honored everywhere.

## 9. Implementation notes (Expo / RN)

- Motion: **react-native-reanimated** (UI-thread), **react-native-gesture-handler** for gestures
  (native, not JS `onTouchMove`).
- Navigation: **React Navigation** with **typed params** (`navigation.navigate<RootStackParamList>`),
  shared-element transition for card→detail.
- Lists: **FlashList**. Images: **expo-image** (caching + crossfade).
- Theme implemented as typed tokens (see `apps/mobile/src/theme/`), light + dark.
- Build the design-system primitives (Dot, DishCard, EstimateBar, Sheet, Skeleton) before screens.
