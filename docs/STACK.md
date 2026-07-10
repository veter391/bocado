# STACK

> Pinned choices with rationale. Versions verified as of 2026-06-16; re-verify before scaffolding,
> the RN/Expo/Nitro chain moves fast.

## Mobile — Expo (React Native + TypeScript)

Chosen over Flutter. Deciding factors: on-device OCR reach (Apple Vision on iOS, not just ML Kit),
TypeScript shared with the Cloudflare backend, and the larger talent pool. Flutter leads only on
raw animation perf, which RN's New Architecture has largely closed for a list/camera UI.

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Expo SDK 54+** (RN 0.81+, New Architecture on) | required by current camera/OCR libs; near-native perf |
| Language | **TypeScript** (strict) | shared types with Workers backend |
| Camera | **react-native-vision-camera v5** (Nitro) | modern capture, in-memory photos |
| Snapshot OCR | **expo-text-extractor** | Apple **Vision** on iOS + **ML Kit** on Android, on-device |
| Live OCR (optional) | **react-native-vision-camera-ocr-plus v2** | per-frame ML Kit OCR (Jun 2026) |
| Lists | **FlashList** | recycler-based, handles long menus |
| Images | **expo-image** | caching, fast loads |
| OTA / build | **EAS Build + EAS Update** | JS/asset OTA within Apple 3.3.1 |

Notes:
- Native camera/OCR modules require an **EAS dev client** — they do **not** run in Expo Go. Set up
  EAS Build from day one.
- ML Kit lacks an arm64 iOS-Simulator slice → test on a physical device (or Rosetta sim).
- Wrap OCR behind a **thin abstraction** (snapshot vs live engine) so we can swap without touching
  UI; both leading OCR libs are community-maintained (bus-factor risk).
- On-device OCR is **free + offline** — it powers the EXIF-strip / face-check pre-flight and the
  offline degraded mode, and gives a fast text draft before the vision call.

## Backend — Cloudflare Workers (TypeScript)

| Layer | Choice |
|-------|--------|
| Runtime | Cloudflare **Workers** (TS) |
| Router/framework | **Hono** (lightweight, Workers-native, typed) |
| DB | **D1** (`jurisdiction=eu`), accessed via Drizzle ORM |
| Object storage | **R2** (EU jurisdiction) for photos + generated images |
| Image transforms | **Cloudflare Images** |
| AI gateway | **Cloudflare AI Gateway** → OpenRouter (native) |
| Validation | **Zod** (shared schemas with the app) |

Backend is TypeScript end-to-end with the app — one language, shared Zod/TS types for the dish and
profile models.

## AI / data

| Purpose | Choice | License/route |
|--------|--------|---------------|
| Menu vision (OCR/structure/translate/explain/ingredient-infer) | **MiniMax M3** `minimax/minimax-m3` → OpenRouter (ZDR) | fallback `minimax/minimax-01`; **not** DeepInfra (no vision) |
| Dish image gen | **FLUX.1 [schnell]** → Workers AI | Apache-2.0; fallback Fal.ai |
| Nutrition table | **CIQUAL** (primary) + **USDA FDC** (fallback) | Etalab 2.0 / CC0; **BEDCA excluded** (no commercial license) |
| Packaged/barcode (optional, later) | **Open Food Facts** | ODbL |

## Tooling

- Package manager: **pnpm** (consistent with the workspace).
- Lint/format: ESLint flat config + Prettier.
- Tests: **Vitest** for the deterministic engine (nutrition math + suitability rules are pure
  functions — must be unit-tested hard, this is the trust core), Detox/Maestro for mobile E2E later.
- Monorepo: app + worker + shared types in one pnpm workspace.

## Explicitly rejected

- **DeepInfra for vision** — serves only MiniMax-M2.5 (text-only) as of 2026.
- **BEDCA** — commercial use forbidden without AESAN written permission.
- **Flutter** — defensible, but loses on Apple Vision OCR + TS sharing; keep as fallback only if
  animation perf ever becomes the bottleneck.
- **LLM-generated calorie numbers** — banned by architecture; numbers come from the table only.
