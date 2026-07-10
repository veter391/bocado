# BRANDING

> Provisional. Name and exact tokens may change after a naming/trademark pass and a design review.

## 1. Name

**Bocado** (Spanish: "a bite / mouthful") — working name. Warm, food-evocative, European, short,
easy to say. **TODO:** trademark + App Store name-collision check before committing.

## 2. Brand feeling

Calm, warm, trustworthy, effortless. The opposite of a clinical diet app. It should feel like a
**well-printed paper menu** in good light — tactile, inviting, editorial — with one confident
coral accent doing the pointing. Simple like Yuka: you open it, you scan, you get an answer.

Voice: plain, human, honest. No hype, no health-shaming, no fake precision. We say "about 600–750
kcal", not "612 kcal". We say "may contain nuts — check with staff", not "safe".

## 3. Color tokens

Two anchors: **coral** (the single brand accent + primary action) and **paper** (a warm off-white,
never snow-white). Neutrals are warm-gray "ink". The suitability trio is tuned warm to live on
paper.

### Light theme (default)

| Token | Hex | Use |
|-------|-----|-----|
| `paper` | `#FAF4E9` | App background ("paper", warm, not white) |
| `surface` | `#FFFDF7` | Cards, sheets (a touch above paper) |
| `surface-deep` | `#F1E8D6` | Insets, pressed rows, divid-zones |
| `hairline` | `#E7DCC8` | Borders, separators |
| `ink` | `#2A2622` | Primary text (warm near-black) |
| `ink-soft` | `#6F665A` | Secondary text, captions |
| `coral` | `#FF6F5E` | Primary action, brand accent, active state |
| `coral-pressed` | `#ED5A48` | Pressed / hover primary |
| `coral-tint` | `#FFE6E1` | Coral backgrounds, selected chips |
| `on-coral` | `#FFFFFF` | Text/icons on coral |

### Suitability trio (semantic — NOT the brand coral)

| Token | Hex | Meaning |
|-------|-----|---------|
| `good` | `#2E9E6B` | Good choice right now |
| `caution` | `#E0982E` | Okay in moderation / mind the time |
| `avoid` | `#C8432B` | Best avoided now (heavy, late, or against profile) |

> **Critical conflict to manage:** the brand `coral` (#FF6F5E) and the `avoid` red (#C8432B) are
> neighbors. Resolution: (1) `avoid` is a deeper brick-red, clearly darker/less orange than the
> bright brand coral; (2) **every suitability dot is paired with an icon + a one-word label** —
> never color alone (also required for color-blind users / WCAG); (3) do not place a coral primary
> button immediately beside an `avoid` dot without the label between them.

### Dark theme (sketch — finalize in design review)

| Token | Hex |
|-------|-----|
| `paper` | `#1E1B18` |
| `surface` | `#272320` |
| `ink` | `#F3ECE0` |
| `ink-soft` | `#B3A998` |
| `coral` | `#FF7A6A` |
| `good / caution / avoid` | `#46B985` / `#EAB04A` / `#E26A50` |

## 4. Typography

- **Display** (dish names, screen titles): **Fraunces** — a warm, slightly editorial serif that
  reads "menu / paper" and gives character without losing legibility.
- **UI / body**: **Inter** — neutral, highly legible at small sizes, great for dense lists.
- **Data / numbers** (kcal, macros): **Inter** with **tabular figures** (or a mono like IBM Plex
  Mono) so columns align.
- **Fallback:** system fonts (SF Pro / Roboto) if a brand font fails to load — never block render.

Scale: large confident titles, compact body, generous line-height in explanations, tight in lists.

## 5. UI principles

- **One primary action.** The scan button is the hero. Everything else is secondary.
- **Glanceable.** A menu result is a scannable list of cards: dish name, suitability dot + label,
  est. kcal range, optional thumbnail. Detail on tap, not upfront.
- **Quiet until useful.** No walls of text. Explanations expand on demand.
- **Fast.** Skeleton states while scanning; lazy images; nothing blocks the first useful result.
- **Honest UI.** Estimates visibly marked (~, ranges, a small "estimate" tag). AI images carry an
  "AI illustration" badge.

## 6. Accessibility

- WCAG AA contrast for text on `paper` and on `coral` (verify `ink-soft` on `paper`).
- Never encode meaning in color alone — dot + icon + label, always.
- Dynamic type / font scaling supported; layouts reflow, no clipping.
- Full screen-reader labels for the dot ("Good choice", "Avoid now") and for est-nutrition.
