# Bocado — Terms of Service & End-User Licence Agreement (EULA)

> **STATUS: DRAFT TEMPLATE — NOT YET LEGALLY REVIEWED.**
> This document was prepared by reading Bocado's own design and source documents so that it
> reflects the app's *actual* behaviour. It is **not legal advice** and is **not final**. It
> **must** be reviewed and adapted by the owner and by a qualified lawyer in the chosen
> jurisdiction before it is published or shown to any user — in particular the consumer-law,
> liability, and health-data sections (Bocado processes special-category health data under
> **GDPR Art. 9**; see `SECURITY.md` §2.A). Several facts only the owner can supply are marked
> **`[OWNER: …]`** and must be filled in before publication.
>
> **Effective date:** `[OWNER: effective date]`
> **Last updated:** `[OWNER: last-updated date]`
> **App version these Terms cover:** `[OWNER: app version / "v1 / pre-launch"]`

---

## 0. About these Terms

These Terms of Service and End-User Licence Agreement (the **"Terms"**) form a binding agreement
between you (**"you"**, **"the user"**) and `[OWNER: legal entity name — e.g. "Bocado SL" / sole
trader full legal name]`, `[OWNER: registered address]`, `[OWNER: company/tax registration number,
if any]` (**"we"**, **"us"**, **"Bocado"**), governing your use of the Bocado mobile application and
related services (the **"App"** or **"Service"**).

> **Note for the owner:** "Bocado" is a **provisional working name** and is subject to a
> naming/trademark pass before public launch (see `README.md`). Confirm the final product and entity
> name before publishing these Terms.

By downloading, installing, accessing, or using the App, you confirm that you have read, understood,
and agree to be bound by these Terms and by the Bocado **Privacy Policy** `[OWNER: link]` and
**Disclaimer** `[OWNER: link — see §6]`. If you do not agree, do not use the App.

**Eligibility / age.** You must be at least `[OWNER: minimum age — e.g. 16, aligned to GDPR Art. 8
and local law]` years old (or the minimum digital-consent age in your country) to use the App. The
App is not directed at children below that age.

These Terms cover the matters listed below. Where a topic is governed by a separate document
(Privacy Policy, Disclaimer), these Terms incorporate that document **by reference**.

---

## 1. What Bocado is (and is not)

Bocado is a **menu-understanding tool**. You point your camera at a restaurant menu and Bocado:

- reads the menu into a structured dish list (on-device OCR plus a third-party vision model);
- translates and explains each dish in plain language;
- shows a glanceable **suitability indicator** (good / caution / avoid) computed by deterministic
  rules from the time of day and, optionally, your diet and allergy profile;
- shows an **estimated** nutrition range per dish (calories and nutrients) computed from public
  food-composition databases; and
- for paying users, can generate an **AI illustration** of a dish that has no photo.

**Bocado is explicitly NOT:**

- **not a medical, dietary, nutritional, or health service**, and does not provide medical or
  professional advice (see §6 and the Disclaimer);
- **not an allergen-safety guarantee.** Bocado never tells you a dish is "safe" or "allergen-free".
  It only flags that a dish *may contain* an allergen and always directs you to **confirm with the
  restaurant staff**. The legal duty to provide accurate allergen information sits with the
  restaurant (food business operator) under EU Reg. 1169/2011 and applicable national law, not with
  Bocado;
- **not a precise calorie counter.** All nutrition figures are approximate ranges, never exact
  values (see §6);
- **not a translation service** you should rely on for any critical or legal meaning.

This characterisation reflects how the App actually behaves: user-facing nutrition values, the
suitability indicator, and allergen flags are produced by deterministic code over real databases,
**not** by the AI model (see `ARCHITECTURE.md` §3, "How the LLM is boxed in").

---

## 2. Licence to use the App

Subject to your compliance with these Terms, we grant you a **personal, limited, non-exclusive,
non-transferable, non-sublicensable, revocable licence** to download and use one copy of the App on
a device you own or control, solely for your own personal, non-commercial use.

This is a licence, **not a sale**. We (and our licensors) retain all right, title, and interest in
and to the App, including all software, content, designs, trademarks, and the underlying databases,
except for content you provide. No rights are granted to you except as expressly set out here.

Where you obtain the App through a third-party app store (Apple App Store, Google Play), this licence
is additionally subject to that store's terms, and the relevant **app-store EULA provisions** (for
example, Apple's *Licensed Application End User License Agreement*) apply and prevail to the extent
required by that store. `[OWNER: confirm which stores Bocado will ship on.]`

### 2.1 Restrictions

You agree not to, and not to permit anyone else to:

- copy, modify, translate, or create derivative works of the App except as allowed by law;
- reverse-engineer, decompile, or disassemble the App, or attempt to derive its source code, except
  to the limited extent such restriction is prohibited by applicable law;
- rent, lease, lend, sell, redistribute, or sublicense the App;
- remove, obscure, or alter any proprietary notices, or any **"AI illustration"** or **estimate**
  label or other disclaimer shown in the App (see §4 and §6);
- circumvent, disable, or interfere with security, billing, entitlement, or usage-limit features
  (including the free-tier scan limits or the free/Pro entitlement gate);
- use the App in any way that breaches applicable law or these Terms.

---

## 3. Accounts, profile data, and the anonymous-first model

Bocado is **anonymous-first**. You can use the core scanning experience **without creating an
account**.

- Your **diet, allergy, and goal profile is stored on your device by default** (in the operating
  system's secure keystore), and your health/allergy information is treated as **special-category
  health data** under GDPR Art. 9, collected only with your **separate, explicit consent** and
  kept on-device unless you expressly consent otherwise (see `SECURITY.md` §1–2 and the Privacy
  Policy).
- The menu-perception (AI vision) request is engineered to carry **only** the cleaned menu image
  and a fixed prompt — never your identity, allergies, location, or profile (see `ARCHITECTURE.md`
  §0 and `SECURITY.md` §1).
- Any optional email you enter (for example, to "keep Pro across devices") is, in the current
  version, stored **locally on your device only** and does **not** create a server account.
  `[OWNER: confirm before launch — if/when server accounts are introduced, this clause and the
  Privacy Policy must be updated, and account-security/termination terms added.]`

You are responsible for the security of your device and for any activity that occurs through your
copy of the App. If Bocado later introduces accounts, additional account terms will apply.

---

## 4. AI-generated content notice

Some content in the App is generated by artificial-intelligence models:

- **Dish illustrations** shown for dishes without a photo are **AI-generated images**. They are
  produced by a third-party image model `[OWNER: confirm production image model/provider]`,
  generated on demand and cached. They are **decorative illustrations, not photographs** of the
  actual dish, and **may not accurately depict** the real food, its ingredients, portion, or
  presentation. Every such image is shown with a clearly visible **"AI illustration"** label in the
  App and is marked as AI-generated on the wire (an `X-AI-Generated` signal), consistent with our
  transparency obligations under the **EU AI Act, Art. 50** (see `SECURITY.md` §2.C and
  `apps/api/src/routes/image.ts`).
- **Translations, dish explanations, and ingredient inferences** are produced with the help of an
  AI vision/language model and may contain errors, omissions, or inaccuracies. Do not rely on them
  for any safety-critical, medical, dietary, or legal purpose.

You must not present, redistribute, or rely on AI-generated images as if they were real photographs,
and you must not remove the "AI illustration" label.

---

## 5. Subscriptions, billing, and store purchases

Bocado is offered on a **freemium** basis.

### 5.1 Free tier

The free tier provides core functionality with limits, including a limited number of menu scans
(reflected in-app as "a few each week") and reduced detail; AI dish images, full AI descriptions and
translations, smart filters, and scan history are **Pro-only**. We may adjust free-tier limits over
time (see §9).

### 5.2 Bocado Pro plans and prices

Bocado Pro is a paid subscription offered as:

| Plan | Price | Billing cadence |
|------|-------|-----------------|
| Monthly | **EUR 5.99 / month** | renews monthly |
| Annual | **EUR 49.99 / year** (≈ EUR 4.17 / month) | renews yearly |

Prices are as displayed in the App at the time of purchase. The **price actually charged, the
currency, and any applicable taxes (e.g. VAT) are those shown by the relevant app store** at
checkout for your country, which may differ from the figures above due to local pricing, currency
conversion, and tax. The figures above reflect the in-app paywall shown at purchase.

### 5.3 Billing is handled by the app store

Bocado Pro is sold as an **in-app purchase / auto-renewing subscription processed by the app store**
from which you downloaded the App (Apple App Store or Google Play), `[OWNER: confirm whether
RevenueCat is used as the purchase/entitlement layer at launch]`. Accordingly:

- **Payment, billing, currency, taxes (including VAT/GST), and receipts are handled by the app
  store, not by Bocado.** We do not collect or process your payment-card details.
- Your subscription **auto-renews** at the end of each billing period at the then-current price
  unless you cancel at least 24 hours before the period ends (or within the window your store
  requires).
- You can **manage or cancel** your subscription at any time in your app-store account settings.
  Cancellation stops future renewals; it does not retroactively refund the current period unless
  required by law or store policy.
- **Refunds are handled by the app store** under that store's policy and your statutory consumer
  rights. We generally cannot issue refunds directly for store purchases; please use your store's
  refund process. `[OWNER: confirm refund/withdrawal handling, including EU consumer right of
  withdrawal for digital content under Directive 2011/83/EU and local transposition.]`

### 5.4 Current build notice (pre-launch)

> **Honesty note (remove or revise at launch):** In the current build, in-app purchasing is **not
> yet wired to a live billing provider** — the purchase/restore flow is a development **mock** that
> grants Pro locally for testing and involves **no real payment** (see `entitlement.tsx`,
> "MOCK BILLING — READ BEFORE SHIPPING"). These subscription Terms describe the **intended live
> billing model**. Real billing, receipt validation, and any server-side entitlement **must be
> integrated and verified before these Terms are presented to paying users.**

### 5.5 Fair use

Pro use is subject to fair use. We may apply a reasonable soft cap on extreme scan volumes to
protect the Service (fair-use guard) and contact you before taking action on a
genuinely abusive pattern.

---

## 6. Estimates and the "not medical advice" disclaimer (by reference)

All nutrition information in the App is an **estimate shown as a range, not an exact figure**, and is
**not medical, dietary, or nutritional advice**. This reflects the App's actual copy — for example,
the dish detail screen states that the nutrient lights are *"estimates for one portion, not medical
advice"* (`DishDetailScreen.tsx`), nutrition surfaces carry the *"Estimate only, not exact."* note,
and allergen flags always read *"May contain — always confirm with restaurant staff."*
(`packages/shared/src/constants.ts`).

The full **Disclaimer** `[OWNER: link]` is incorporated into these Terms **by reference** and you
agree to it. In summary, and without limiting it:

- Do **not** rely on Bocado for decisions where an error could affect your health or safety. If you
  have an allergy, intolerance, medical condition, or specific dietary requirement, **always confirm
  ingredients and preparation directly with the restaurant** and consult a qualified professional.
- Bocado does **not** guarantee that any dish is safe, allergen-free, or suitable for you, and does
  not make health claims about any food (consistent with EU Reg. 1924/2006 — see `SECURITY.md`
  §2.D).
- Suitability indicators and time-of-day logic are **Bocado conventions and estimates**, not medical
  thresholds (see `packages/shared/src/constants.ts` and `DESIGN.md`).

---

## 7. Acceptable use

You agree to use the App lawfully and not to:

- scan or upload images that you have no right to use, or that contain other people in a way that
  infringes their rights; the App performs an on-device pre-flight to strip location metadata and to
  block or crop faces/people before any upload (see `SECURITY.md` §3), but you remain responsible
  for what you capture;
- upload unlawful, infringing, abusive, or harmful content, or content that is not a menu;
- use the App to build a competing product, to scrape or bulk-extract our data or databases, or to
  train other models on our outputs;
- interfere with, overload, or attempt to gain unauthorised access to the Service, our Workers/API,
  storage, or other users' data;
- misuse the AI features (for example, attempting to make the model produce content outside the
  intended menu-understanding purpose).

We may suspend or terminate access for breach of this section (see §10).

---

## 8. Intellectual property and third-party data

- The App, its software, design, and brand are owned by us or our licensors (see §2).
- Nutrition data is derived from public databases — **CIQUAL** (ANSES, under the *Etalab Open
  Licence 2.0*, which requires attribution and a last-update date) and **USDA FoodData Central**
  (public domain, citation requested) (see `INFRASTRUCTURE.md` §3 and `STACK.md`). Required
  attributions are shown in-app; you must not remove them.
- AI illustrations are generated under the applicable model licence `[OWNER: confirm production
  image-model licence/terms]`. Do not treat them as photographs (see §4).
- **Your content:** menu photos and any text you provide remain yours. You grant us a limited
  licence to process them solely to provide the Service (for example, transient processing of a
  cleaned image by the vision model and, if you choose to save a menu, storing it as described in
  the Privacy Policy). We do not retain raw photos on our servers without your consent (see
  `SECURITY.md` §3).

---

## 9. Changes to the App and to these Terms

We may update, change, suspend, or discontinue any part of the App (including free-tier limits and
Pro features) at any time, and we may update these Terms. If we make a material change to these
Terms, we will provide reasonable notice by appropriate means `[OWNER: specify notice method — e.g.
in-app notice and updated "Last updated" date]` before it takes effect. Your continued use of the App
after a change takes effect constitutes acceptance of the updated Terms; if you do not agree, you
must stop using the App. Changes that reduce your statutory rights, or material changes to a paid
subscription, will be handled in accordance with applicable consumer law.

---

## 10. Suspension and termination

- **By you:** you may stop using the App and uninstall it at any time, and cancel any subscription
  via your app store (see §5.3).
- **By us:** we may suspend or terminate your access if you materially breach these Terms, misuse
  the Service, or where required by law. Where proportionate and lawful, we will give notice and an
  opportunity to cure.
- **Effect:** on termination, the licence in §2 ends and you must stop using the App. Sections that
  by their nature should survive (e.g. §6, §8, §11, §12, §13) survive termination. Termination does
  not by itself entitle you to a refund except as required by store policy or law (see §5.3).

---

## 11. Disclaimers of warranty

To the maximum extent permitted by applicable law, and **without limiting your mandatory statutory
rights as a consumer**:

- the App and all content (including translations, explanations, nutrition estimates, suitability
  indicators, allergen flags, and AI illustrations) are provided **"as is"** and **"as available"**,
  without warranties of any kind, whether express or implied, including fitness for a particular
  purpose, accuracy, or non-infringement;
- we do **not** warrant that the App will be uninterrupted, error-free, or that any estimate,
  translation, or flag is accurate or complete;
- the App depends on third-party services (app stores, Cloudflare, the AI model/image providers, and
  public nutrition databases) and we are not responsible for their availability or accuracy.

Some jurisdictions do not allow the exclusion of certain warranties; in that case the above applies
only to the extent permitted, and your statutory rights are unaffected.

---

## 12. Limitation of liability

To the maximum extent permitted by applicable law, and subject to §12.1:

- we will not be liable for any **indirect, incidental, special, consequential, or punitive**
  damages, or for loss of profits, data, or goodwill, arising out of or related to your use of, or
  inability to use, the App;
- in particular, given the App's nature, **we are not liable for any loss, harm, allergic reaction,
  illness, or other adverse outcome resulting from reliance on the App's estimates, translations,
  suitability indicators, allergen flags, or AI illustrations** — these are aids, not guarantees,
  and you must confirm allergen and ingredient information with the restaurant and consult a
  professional where your health requires it (see §1, §6);
- our total aggregate liability for all claims relating to the App in any 12-month period will not
  exceed the **greater of (a) the amount you paid us (via the app store) for the App in that period,
  or (b) `[OWNER: cap amount — e.g. EUR 50]`**.

### 12.1 What we do NOT exclude

Nothing in these Terms excludes or limits our liability where it cannot lawfully be excluded,
including liability for **death or personal injury caused by our negligence, for fraud or fraudulent
misrepresentation, or for any liability that cannot be limited under applicable consumer-protection
law**. `[OWNER + LAWYER: confirm the exact mandatory-liability carve-outs for the governing
jurisdiction — these vary and are critical given the health-data and allergen context.]`

---

## 13. Governing law and dispute resolution

These Terms are governed by the laws of **`[OWNER: governing jurisdiction — e.g. Spain]`**, without
regard to conflict-of-laws rules. The **`[OWNER: competent courts — e.g. the courts of Madrid,
Spain]`** will have jurisdiction, **except** that, if you are a consumer, you retain the benefit of
any mandatory protections and the right to bring proceedings in the courts of your country of
residence as guaranteed by applicable consumer law.

> **EU consumers:** the European Commission's Online Dispute Resolution platform may be available;
> `[OWNER: include ODR link if required for your launch markets]`. `[OWNER + LAWYER: confirm
> consumer-dispute and jurisdiction wording for each launch market.]`

---

## 14. Miscellaneous

- **Entire agreement.** These Terms, together with the Privacy Policy and Disclaimer incorporated by
  reference, are the entire agreement between you and us regarding the App.
- **Severability.** If any provision is held unenforceable, the rest remains in effect.
- **No waiver.** Our failure to enforce a provision is not a waiver.
- **Assignment.** You may not assign these Terms; we may assign them to a successor in connection
  with a merger, acquisition, or reorganisation, on notice.
- **App-store terms prevail** where required by the relevant store (see §2).
- **Language.** These Terms are provided in English; `[OWNER: specify whether a translated version
  is offered and which language governs in case of conflict, per local consumer law.]`

---

## 15. Contact

Questions about these Terms: `[OWNER: support/legal contact email]`
Legal entity: `[OWNER: legal entity name and registered address]`

---

### Owner / lawyer checklist before publishing

- [ ] Replace **every** `[OWNER: …]` placeholder with verified facts.
- [ ] Have a qualified lawyer review the whole document, **especially** §6, §11, §12 (liability for
      health/allergen reliance) and §3/§5 against **GDPR Art. 9** and EU consumer law.
- [ ] Confirm the final **product/entity name** (the "Bocado" name is provisional — `README.md`).
- [ ] Confirm the **app stores** and whether **RevenueCat** is the entitlement layer at launch.
- [ ] Finalise and link the **Privacy Policy** and **Disclaimer** (neither exists in the repo yet);
      ensure cross-references in §0, §4, §6, §8 resolve.
- [ ] **Wire and verify real billing** before presenting subscription Terms to paying users; then
      revise/remove §5.4.
- [ ] Confirm production **AI image model/provider and its licence** (§4, §8) — the repo references
      FLUX.1 [schnell] / Flux-2 via Workers AI/WaveSpeed; confirm what actually ships.
- [ ] Set the **effective**, **last-updated**, and **app-version** fields (§0).
```
