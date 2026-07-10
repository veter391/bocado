# INFRASTRUCTURE

> Cloudflare-based, EU-residency-capable. Prices/limits verified as of 2026-06-16 — re-verify
> against the linked pages before any cost commitment.

## 1. Service map

| Concern | Service | Config | Source |
|--------|---------|--------|--------|
| API / compute | **Workers** | Paid plan ($5/mo: 10M req + 30M CPU-ms incl.) | [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| User + metadata DB | **D1** | created `--jurisdiction=eu` (immutable, GDPR-grade) | [d1 jurisdiction](https://developers.cloudflare.com/changelog/post/2025-11-05-d1-jurisdiction/) |
| Photos + generated images | **R2** | EU jurisdiction bucket (`<acct>.eu.r2.cloudflarestorage.com`, immutable, zero egress) | [r2 data location](https://developers.cloudflare.com/r2/reference/data-location/) |
| Thumbnails / resize | **Cloudflare Images** | transformations on R2-sourced images | [images pricing](https://developers.cloudflare.com/images/pricing/) |
| LLM + image-gen gateway | **AI Gateway** | OpenRouter is a native provider; logging, rate-limit, fallback | [ai-gateway providers](https://developers.cloudflare.com/ai-gateway/usage/providers/) |
| On-platform image gen | **Workers AI** | FLUX.1 [schnell] (Neurons; 10k/day free) | [workers-ai pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |

## 2. EU data residency posture

- **Storage residency is guaranteed** by D1 `jurisdiction=eu` and R2 EU-jurisdiction buckets. Both
  are **set at creation and cannot be changed later** — provision them correctly the first time or
  a migration is required, not a config flip.
- **Edge-processing residency** (Data Localization Suite: Regional Services, Customer Metadata
  Boundary) is **Enterprise-only**. For a small app we do not buy it; we rely on EU storage
  residency + the data-minimization design (perception call carries no personal data).
- **CLOUD Act caveat:** Cloudflare, Inc. is US-domiciled, so EU storage reduces but does not fully
  eliminate the theoretical possibility of US-authority access. Document this in the DPA/privacy
  review. ([source](https://developers.cloudflare.com/r2/reference/data-location/))

## 3. AI providers

### Vision (menu perception)
- **Primary:** MiniMax **M3** (`minimax/minimax-m3`) via **OpenRouter** — natively multimodal
  (image+text in), 1M context, ~$0.30/M input · $1.20/M output (2026).
  ([model](https://openrouter.ai/minimax/minimax-m3))
- **Fallback:** `minimax/minimax-01` — image-capable, ~$0.20/M · $1.10/M.
- **Routed through Cloudflare AI Gateway** (OpenRouter is natively supported) for logging,
  rate-limiting, and fallback.
- **Zero-Data-Retention ON** (`"zdr": true` per request or account-level) so requests only hit
  provider endpoints that don't store data. ([zdr](https://openrouter.ai/docs/guides/features/zdr))
- **NOT DeepInfra:** as of June 2026 DeepInfra serves only MiniMax-M2.5, which has **no image
  input** — it cannot read menu photos. ([deepinfra models](https://deepinfra.com/models?q=minimax))

> Both OpenRouter and DeepInfra are US companies. EU residency for the inference hop (OpenRouter
> EU in-region routing + signed DPA) appears **enterprise-only**. We do not depend on it: the
> perception call is engineered to carry **no personal data** (see [SECURITY.md](SECURITY.md)), so
> GDPR Chapter V transfer rules do not bite. Pin a specific model version in code, never "latest" —
> MiniMax shipped M1→M2→M2.5→M2.7→M3 in ~18 months.

### Image generation (dish illustrations)
- **Primary:** FLUX.1 [schnell] on **Workers AI** — on-platform, <$0.001/image at 4 steps,
  Apache-2.0 (commercial OK). ([flux schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell))
- **Fallback:** FLUX.1 [schnell] on **Fal.ai** — $0.003/megapixel, sub-second warm latency.
- **Spillover:** Together AI free "Open" FLUX schnell endpoint (verify terms before relying).
- Generated lazily on first tap; cached in R2 by normalized dish name (see ARCHITECTURE §5).

### Nutrition data (not an "AI provider" — a static dataset)
- **Primary:** CIQUAL (ANSES) — generic foods, per-100g, **Etalab Open Licence 2.0** (commercial
  use allowed; obligation = attribution + last-update date). Ingest the official Excel/XML dump
  into our own store. ([ciqual](https://www.anses.fr/en/content/ciqual-nutritional-composition-table))
- **Gap-fill:** USDA FoodData Central — **CC0** public domain (citation requested), US-centric.
- **Optional (packaged/barcode only):** Open Food Facts — **ODbL** (attribution; share-alike only
  if we publicly redistribute a derived *database*, which a normal app does not).
- **Excluded:** **BEDCA** — its terms forbid commercial use without express AESAN written
  permission. Do not ship BEDCA-derived data. ([bedca terms](https://www.bedca.net/bdpub/UsoBD.pdf))

## 4. Environments

- `dev` — local Workers (`wrangler dev`), preview D1/R2 (still EU-jurisdiction to mirror prod), AI
  Gateway in a `dev` namespace, ZDR on. Mobile via Expo dev client (EAS) — not Expo Go (native
  modules).
- `staging` — separate Workers + EU D1/R2, real providers at low limits, used for the pre-launch
  OCR/image evals.
- `prod` — EU D1/R2, AI Gateway prod namespace, pinned model versions, monitoring on.

Secrets (OpenRouter key, Fal key, etc.) in Workers secrets; never in the mobile app. The mobile app
talks only to our Worker, never directly to any model provider.

## 5. Rough cost intuition (small app, 2026 prices)

- Workers $5/mo base. D1 + R2 within free/low tiers initially (R2 has zero egress).
- Per scan: one MiniMax M3 vision call (cents-scale, dominated by image input tokens — needs a
  worked estimate, see open questions). Image gen <$0.001 each, once per dish globally.
- This is what makes a **€5/month** subscription viable; the dietary-needs cohort's recurring use
  is the revenue case.
