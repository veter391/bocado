<div align="center">

<img src="docs/assets/logo.png" alt="Bocado" width="112" height="112" />

# Bocado

**Point your camera at any restaurant menu and actually understand it.**
Every dish translated, explained, and scored for *you* — with an honest estimate of what's in it,
so you know what to order. EU-first. Privacy-first. Math-first.

[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-0b7285)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android%20(APK)-3ddc84)](../../releases/latest)
[![Tests](https://img.shields.io/badge/tests-505%20passing-2f9e44)](#quality-bar)
[![Made with Expo](https://img.shields.io/badge/Expo-SDK%2054-000020)](https://expo.dev)

</div>

---

## What it does

Most menus abroad are walls of text in a half-read language, no pictures, strange dish names —
and the waiter is already standing there. Bocado turns a photo of that menu into a clean, ranked
list:

- **Translated + explained** — each dish in plain language, not a literal word swap.
- **A verdict for the moment** — a Yuka-style traffic light (good / caution / avoid) tuned to the
  **time of day**, plus per-nutrient lights.
- **Honest nutrition** — an *estimated range* (never a hard figure) from real food databases, with
  a visible confidence level.
- **Allergen flags** — "may contain — confirm with staff", never a false "safe".
- **Multi-page** — shoot several pages of one menu; repeated dishes are recorded once.
- **AI dish images** *(Pro)* — when the menu has no photo, an illustration so you can see the dish.

## Download

<table>
<tr>
<td valign="top" width="220">

<img src="docs/assets/download-qr.png" alt="Scan to download the Android APK" width="200" />

</td>
<td valign="top">

**Android (APK)** — scan the QR, or grab the latest build from the
**[Releases page](../../releases/latest)**.

Sideloading: enable *Install unknown apps* for your browser, open the APK, install.
No account, no sign-up — open it and scan a menu.

> iOS build and store distribution are not published yet (see **Status**).

</td>
</tr>
</table>

## How it works

```
                    on-device                         Cloudflare Worker (EU)
  ┌────────────┐   clean: strip EXIF/GPS,   ┌───────────────────────────────────────────┐
  │  camera    │──▶ downscale, compress ───▶│  /scan  (anonymous — image + static prompt) │
  └────────────┘                            │     │                                       │
                                            │     ▼                                       │
                                            │  perception  →  MiniMax M3 vision (WaveSpeed)│
                                            │     │           structured dishes JSON       │
                                            │     ▼                                       │
                                            │  deterministic engine  (no AI):             │
                                            │   CIQUAL/USDA nutrition · FSA/EU lights ·    │
                                            │   verdict · confidence · allergen match      │
                                            └───────────────────────────────────────────┘
```

**Math-first, AI-narrow.** Ranking, scoring, nutrition and verdicts are deterministic scripts over
real data (fully unit-tested). AI is used *only* where it must be: reading a messy menu photo into
structured text, translation, dish descriptions, and generating dish illustrations. Every number a
user reads as fact is produced by code, not a model.

## Principles (non-negotiable)

1. **Math-first, AI-narrow** — deterministic engine for anything shown as fact.
2. **EU-safe by design** — identity and health/allergy data never leave the device / Cloudflare EU
   and are never attached to a third-party model call. The perception call is anonymous (image +
   static prompt only).
3. **Honest by default** — nutrition is an estimate/range; allergens are "may contain, confirm";
   AI images are clearly labelled illustrations, not photos.
4. **Simple like Yuka** — one primary action (scan), a glanceable result, minimal text.

## Tech stack

| Layer | Choice |
|-------|--------|
| Mobile | Expo SDK 54 · React Native 0.81 · React 19 · TypeScript (strict) |
| Camera | react-native-vision-camera · on-device EXIF/GPS strip + downscale before upload |
| API | Cloudflare Workers · Hono · D1 (EU) · R2 (EU) |
| Perception | MiniMax M3 vision via WaveSpeed (OpenAI-compatible) |
| Dish images | Flux-2 Flash via WaveSpeed, R2-cached by dish name |
| Nutrition | CIQUAL + USDA FoodData Central (deterministic engine) |
| Tests | Vitest — nutrition · API · mobile |

## Repository layout

```
apps/
  mobile/       Expo / React Native app (scan, results, dish detail, paywall)
  api/          Cloudflare Worker: /scan, /image, /menus + perception + rate limiting
packages/
  nutrition/    deterministic nutrition + verdict engine (no network, no AI)
  shared/       shared types / contracts (ScannedMenu, Dish, …)
docs/           architecture · security · stack · design · branding · infrastructure · legal
```

## <a id="quality-bar"></a>Quality bar

- **505 unit tests** green (nutrition · API · mobile), TypeScript strict, zero-warning lint on
  touched code.
- Anonymous perception contract is enforced *and tested*: the scan payload carries only the cleaned
  image(s) + locale + meal context — never profile, allergies, or location.
- Public model endpoints are rate-limited (per-caller, fixed window) and size-capped so a fresh
  deploy is cost-capped out of the box.

## Status

This is a working, self-hostable MVP — not yet a store-published paid product. Honest state:

| Area | State |
|------|-------|
| Menu scan → translate → verdict → nutrition | **Working** (live backend) |
| Deterministic nutrition/verdict engine | **Working**, fully tested |
| Multi-page capture + cross-page dedup | **Working** |
| In-app purchases (Pro) | **Mock** — no store SDK wired yet |
| AI dish images | Implemented; **disabled** until R2 is enabled |
| On-device face/menu pre-flight | **Not implemented** (EXIF/GPS strip is shipped) — see [SECURITY.md](docs/SECURITY.md) §3 |
| iOS build / store distribution | **Not published** |

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Stack](docs/STACK.md) ·
[Design system](docs/DESIGN.md) · [Branding](docs/BRANDING.md) ·
[Infrastructure](docs/INFRASTRUCTURE.md) · legal: [Privacy](docs/legal/PRIVACY_POLICY.md) ·
[Terms](docs/legal/TERMS_OF_SERVICE.md) · [Disclaimers](docs/legal/DISCLAIMERS.md) ·
[Attribution](docs/legal/ATTRIBUTION.md)

## Running it yourself

Prereqs: Node 20+, pnpm, a Cloudflare account (for the Worker), a WaveSpeed API key.

```bash
pnpm install

# API (Cloudflare Worker)
cd apps/api
cp .dev.vars.example .dev.vars      # add WAVESPEED_API_KEY
pnpm dev                            # wrangler dev on :8787

# Mobile (Expo)
cd apps/mobile
pnpm dev                            # Expo; point EXPO_PUBLIC_API_BASE_URL at your Worker
```

Secrets (`.dev.vars`, tokens) are gitignored and never committed. Set the Worker's production
secret with `wrangler secret put WAVESPEED_API_KEY`.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — source is public; personal, educational, research and
other **noncommercial** use is free. Commercial use (selling it, or a commercial clone) is not
granted. Nutrition data © CIQUAL (ANSES) and USDA FoodData Central under their respective terms —
see [docs/legal/ATTRIBUTION.md](docs/legal/ATTRIBUTION.md).

> **Not medical advice.** Nutrition figures are estimates; allergen flags are not a safety
> guarantee — always confirm with restaurant staff.
