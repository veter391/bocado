# Bocado — Privacy Policy

> **STATUS: DRAFT TEMPLATE — NOT YET IN FORCE.**
> This document is an engineering-grounded draft prepared by the Bocado team. It is **not** final legal
> advice. Before publication it MUST be reviewed and completed by the owner and by a qualified data-protection
> lawyer, with particular attention to the processing of **health data (GDPR Article 9)**, the controller
> identity, and the EU/Spain jurisdiction specifics. Every `[OWNER: …]` marker below is a placeholder for a
> fact only the owner/lawyer can supply.
>
> **Accuracy note:** This draft describes the app's *current, verified* behaviour as built in the repository
> at the time of writing — including features that are **implemented**, features that are **planned but not
> yet wired** (e.g. real billing), and one safeguard that is **described in our design but not yet implemented
> in code** (on-device face detection — see §4.2). It does not describe a deployed production service: as of
> this draft, Bocado is **not yet released** and the backend is **not yet deployed**. Do not publish this as a
> live policy until those states match reality.

**Last updated:** [OWNER: publication date]
**Effective date:** [OWNER: effective date]

---

## 1. Who we are

Bocado ("Bocado", "we", "us") is a mobile application that helps you understand a restaurant menu: it reads a
photo of the menu and returns, for each dish, a translation, a plain-language explanation, an estimated
nutrition range, and a glanceable suitability indicator.

The data controller for the processing described in this policy is:

- **Controller:** [OWNER: legal/company name]
- **Address:** [OWNER: registered address]
- **Contact for privacy questions / data-subject requests:** [OWNER: privacy contact email]
- **Data Protection Officer (if appointed):** [OWNER: DPO name + contact, or "not appointed"]

We are established in / target the **European Union (Spain-first)**; this policy is written to the EU General
Data Protection Regulation (GDPR) and applicable Spanish data-protection law. [OWNER + LAWYER: confirm the
controller's jurisdiction and supervisory authority — e.g. the Spanish AEPD.]

---

## 2. Our core privacy principle: two separate planes

Bocado is built so that **the part of the app that understands your menu never sees who you are or your
health information.** The system is deliberately split into two planes that do not mix:

| Plane | What it does | Where it runs | Does it see your identity or health data? |
|-------|--------------|---------------|-------------------------------------------|
| **Perception** (anonymous) | Turns a menu photo into structured text | Our server + a third-party AI model | **No.** It receives only the cleaned image and a fixed instruction prompt. |
| **Personalization** (on your device) | Your diet, allergies and goals; tailoring the results to you | **On your device only** | Yes — and it **never leaves your device**. |

This is enforced in our code, not just promised in this policy. The request that goes to the menu-reading AI
model is built to carry **only** the cleaned image plus a fixed prompt; our scan endpoint **rejects** any
request that tries to attach a profile, allergies or a user id.

---

## 3. Anonymous-first: no account required

You can use Bocado's core features **without creating an account, signing in, or giving us your name, email,
or phone number.** We do not operate a login system. We do not ask for your identity.

To let your device re-open menus *you* saved (the optional history feature), the app generates a **random,
opaque device identifier** the first time it is needed. This identifier:

- is **randomly generated on your device** (it is not derived from your hardware, phone number, advertising
  id, or any personal detail), and is **not** a tracking identifier;
- is stored in your device's secure keystore (Apple Keychain / Android Keystore) and sent only as a request
  header (`X-Device-Id`) so the server can return the menus that device saved;
- is **never** joined to your identity and **never** linked across apps or used for advertising.

You can stop using saved menus at any time; clearing the app's data / reinstalling discards the identifier.

---

## 4. What data we process, and how

### 4.1 Menu photos (anonymous "scan")

When you scan a menu, the app processes the **photo of the menu** as follows:

1. **On your device, before anything is sent**, the photo is **cleaned**: it is re-encoded to a compressed
   JPEG, which **removes EXIF/GPS metadata** (capture location coordinates, timestamp, device serial,
   orientation tags, etc.), and it is downscaled. The image that leaves your device carries **no location or
   device metadata**.
2. The cleaned image is sent to our server (a Cloudflare Worker in the EU). Our server sends **only the
   cleaned image plus a fixed instruction prompt** to a third-party AI vision model (see §6, "Sub-processors")
   to read and structure the menu text. **No account, no allergies, no location, no goals, and no free text
   about you are ever attached to that AI request.**
3. The structured *result* (dish names, translations, explanations, inferred ingredient lists) is returned to
   your device. Nutrition estimates, the suitability indicator, and "may contain" allergen flags are computed
   by our own deterministic code, not by the AI model.

**Caching of menu results.** To avoid re-charging an AI call for the identical menu image, our server stores
the *structured text result* of a scan, keyed by a **one-way SHA-256 hash** of the cleaned image. We store the
hash and the resulting text — **we do not store the menu photo itself** in this cache. [OWNER + LAWYER:
confirm and document a retention period / purge policy for this anonymous cache before launch.]

**Lawful basis:** processing the menu photo to deliver the result you requested — **Article 6(1)(b)** GDPR
(performance of a service you asked for) and/or **Article 6(1)(f)** (our legitimate interest in providing and
improving the menu-reading feature). A cleaned menu photo with no people and no location metadata is intended
to be non-personal; see §4.2 for the important limit on this.

### 4.2 Faces and bystanders in photos — current limitation (please read)

A photo of a menu *could* incidentally capture a person (for example, a hand, a face across the table, or a
reflection). Our design intends to detect faces/people on the device and block or crop them out **before** any
upload.

**Honest current state:** as built today, the app **strips EXIF/GPS metadata and downscales** every image,
but the **on-device face/person detection is not yet implemented** (it is a placeholder pending on-device
testing). This means we cannot currently guarantee that an incidental person will be removed before the
cleaned image is sent for menu reading.

**What this means for you:** please point the camera at the menu only and avoid including people in the frame.
[OWNER + LAWYER: this gap must be resolved or explicitly risk-assessed before public launch, because an image
that captures an identifiable person is personal data — and possibly special-category data. Either ship the
on-device detection, or update this section and the in-app guidance accordingly.]

### 4.3 Health data: diet, allergies, goals — stored ONLY on your device (GDPR Article 9)

Bocado can tailor results to your **diet** (e.g. vegan, halal, keto, gluten-free), your **allergies/
intolerances** (the 14 EU-regulated allergens), your **goals** (e.g. low-sodium), and an optional **free-text
note** about a special diet or condition.

Information about your **allergies, intolerances, or a medical diet/condition is health data — a special
category of personal data under GDPR Article 9.** Because of that, Bocado handles it with the strictest
safeguards we can offer:

- **It is stored on your device only**, in the operating system's secure keystore (Apple Keychain / Android
  Keystore). **It is never sent to our server and never sent to any AI model.**
- It is **only collected and stored after you give explicit, separate, unbundled consent** specifically for
  health data (it is **not** pre-ticked and **not** bundled into general terms). Until you grant that consent,
  the app will not store allergies or the free-text health note at all.
- The allergy-aware part of your menu results (the personalized suitability indicator and "may contain X —
  confirm with staff" flags) is computed **on your device**, by joining your local profile to the anonymous
  results the server returned.

**Lawful basis:** **Article 9(2)(a)** GDPR — your **explicit consent** — combined with data minimization
(Article 5(1)(c)): we collect only what the feature needs and keep it on-device by default.

**Withdrawing consent:** you can withdraw health-data consent in the app at any time. Withdrawing consent
**immediately deletes** the allergy list and the free-text health note from your device. You can also wipe the
entire on-device profile at any time (see §7, "Your rights").

> **Allergen safety disclaimer (not a privacy term, but essential):** Bocado **never** tells you a dish is
> "safe" or "allergen-free." Allergen information is shown as *"may contain — always confirm with the
> restaurant staff."* The legal duty to provide accurate allergen information rests with the restaurant.

### 4.4 Saved menus (optional history)

If you save a scanned menu, the **anonymous menu result** (dish text, estimates, time-based suitability — the
same data your screen already shows) is stored on our server under your random device identifier (§3). This
record contains **no profile, allergy, account, or location data** — our server rejects any attempt to attach
them. It is scoped so that only the device that saved a menu can list or re-open it.

**Lawful basis:** Article 6(1)(b) — providing the history feature you opted into.
[OWNER + LAWYER: define a retention period for saved menus.]

### 4.5 Dish illustrations (AI-generated images)

When you open a dish without a photo, the app can request an **AI-generated illustration** of that dish. The
only thing sent to generate it is the **dish name** (a menu string) inside a fixed prompt — **no data about
you.** Generated images are cached on our EU storage and reused for everyone who scans the same dish, keyed by
the normalized dish name. Every such image is **labelled as an AI illustration** in the app and marked
AI-generated in our metadata (consistent with EU AI Act transparency rules); it is decorative and is **not** a
photo of the actual plate.

### 4.6 Subscription / billing (planned — not active in this build)

Bocado is planned as freemium with an optional paid "Pro" tier.

**Honest current state:** in the current build, the purchase flow is a **mock** — there is **no real payment,
no receipt, and no billing provider connected.** The app remembers your tier locally in the secure keystore on
your device.

When real billing is enabled, purchases will be processed by the **app stores (Apple App Store / Google Play)**
and/or a subscription-management provider (**RevenueCat**) — see §6. In that model, **your payment details are
handled by Apple, Google, and/or the payment provider, not by Bocado**; we would receive only a purchase/
entitlement status, not your card number. [OWNER + LAWYER: before enabling billing, confirm the exact
provider(s), what identifiers they share with us, and update this section accordingly.]

### 4.7 Nutrition lookups

Nutrition estimates are computed from open nutrition databases (CIQUAL and USDA FoodData Central). For
ingredients our built-in dataset cannot resolve, the server may query the **USDA FoodData Central** API. That
lookup sends **only a generic food name** (e.g. "grilled chicken breast") — **never** your identity, allergies,
or location.

---

## 5. What we do NOT do

- **No ads, no advertising identifiers, no ad networks.**
- **No third-party analytics or behavioural tracking** of you across apps or websites. [OWNER + LAWYER:
  confirm this remains true at launch; if any crash-reporting or analytics SDK is added later, this section
  and §6 must be updated and a lawful basis chosen.]
- **No selling or renting of personal data.**
- **No profiling for advertising.**
- **No transmission of your health data to our servers or to any AI model.**

---

## 6. Sub-processors and recipients

We use the following service providers ("sub-processors") to operate the parts of Bocado that run off your
device. **Your on-device health data is never shared with any of them.**

| Provider | Role | What it receives | Notes |
|----------|------|------------------|-------|
| **Cloudflare** (Workers, D1, R2, AI Gateway, Workers AI) | Hosting, EU data storage, edge compute, on-platform image generation | Cleaned menu images (transiently), anonymous menu results, anonymous device identifier, generated dish images | Storage uses **EU-jurisdiction** D1/R2. Cloudflare, Inc. is US-domiciled — see §8 (CLOUD Act caveat). |
| **WaveSpeed AI** | Primary AI provider for menu reading (MiniMax M3 vision model) and, optionally, dish-image generation | Cleaned menu image + fixed prompt **only**; or a dish name + fixed prompt for images | No personal/health data is ever sent. [OWNER + LAWYER: confirm WaveSpeed's company location, data-retention/zero-retention terms, and sign a Data Processing Agreement (DPA).] |
| **Google Cloud — Vertex AI (Imagen 4 Fast)** | Default dish-image generation (EU region) | A dish name inside a fixed prompt **only** | Called in an EU region. [OWNER + LAWYER: confirm DPA + region.] |
| **OpenRouter** | *Fallback* AI gateway for menu reading (used only if the primary path is unconfigured) | Cleaned menu image + fixed prompt **only** | Zero-Data-Retention requested. US company. [OWNER + LAWYER: confirm whether this fallback is enabled in production; if not, remove this row.] |
| **USDA FoodData Central** | Nutrition data lookup for unmatched ingredients | A **generic food name** only | US government dataset; no personal data sent. |
| **Apple App Store / Google Play / RevenueCat** | Payment & subscription handling (**planned, not active in this build**) | Payment/subscription data handled by them directly | See §4.6. Activate only after the owner connects real accounts. |

[OWNER + LAWYER: maintain this as the authoritative sub-processor list, attach signed DPAs for each active
processor, and publish a way for users to be notified of changes.]

---

## 7. Your rights (GDPR)

You have the following rights regarding your personal data. Because Bocado is anonymous-first and keeps your
health data on your device, many of these you can exercise directly in the app:

- **Access** — ask what we hold. Note that your diet/allergy/goal profile lives **only on your device**; you
  can view it in the app at any time, and we do not hold a copy.
- **Erasure ("right to be forgotten", Art. 17)** —
  - **On-device data:** the app provides a one-tap **wipe** that deletes your entire stored profile (diet,
    allergies, goals, notes) and a consent-withdrawal action that immediately deletes the health data it
    covered. Reinstalling/clearing app data also removes the local profile and device identifier.
  - **Saved menus on our server:** [OWNER + LAWYER: confirm the in-app or contact route to delete server-side
    saved menus for a device, and document the anonymous-cache purge.]
- **Rectification** — correct your profile directly in the app.
- **Withdraw consent** — withdraw health-data consent in the app at any time; it does not affect processing
  done before withdrawal.
- **Restriction, objection, and data portability** — [OWNER + LAWYER: describe how these are handled given the
  anonymous, on-device-first design.]
- **Lodge a complaint** with a supervisory authority — in Spain, the **Agencia Española de Protección de Datos
  (AEPD)**, or your local EU authority. [OWNER + LAWYER: confirm the lead authority.]

To exercise any right that requires us, contact: **[OWNER: privacy contact email]**. Because we hold little or
no data tied to you, we may be unable to identify you from a request alone (Art. 11) and may ask for the
relevant device's information.

---

## 8. Where your data is processed (EU residency & international transfers)

- **Storage residency:** our databases and object storage (Cloudflare D1 and R2) are provisioned in the **EU
  jurisdiction**. Generated images and any saved (anonymous) menus are stored in the EU.
- **AI processing hop:** the menu-reading AI providers and the fallback gateway are operated by companies that
  may be US-based and may process the request outside the EU. Because that request carries **no personal data**
  (only a cleaned, location-stripped image and a fixed prompt), it is designed so that GDPR international-
  transfer rules do not apply to personal data. [OWNER + LAWYER: validate this position per provider, and put
  Standard Contractual Clauses / DPAs in place where required.]
- **CLOUD Act caveat:** our hosting provider (Cloudflare) is a US-domiciled company. EU storage reduces, but
  does not entirely eliminate, the theoretical possibility of US-authority access requests. [OWNER + LAWYER:
  address this in the DPA / transfer risk assessment.]

---

## 9. Data retention

- **On-device profile and device identifier:** kept on your device until you wipe the profile, withdraw
  consent, or uninstall the app. We never receive a copy.
- **Anonymous menu-result cache (server):** keyed by an image hash; [OWNER + LAWYER: set a retention/purge
  period].
- **Saved menus (server, optional):** [OWNER + LAWYER: set a retention period].
- **Generated dish images:** cached for reuse and not tied to any user; [OWNER + LAWYER: confirm retention].

---

## 10. Children

Bocado is not directed at children. [OWNER + LAWYER: set the minimum age and the consent-age handling for the
EU/Spain. In Spain the digital-consent age is **14**; in some EU states it is up to **16**. Because the app can
process health data, the children/age section needs specific legal sign-off.] We do not knowingly collect
personal data from children below the applicable age of digital consent.

---

## 11. Security

- Health and profile data are stored in the device's hardware-backed secure keystore (Apple Keychain / Android
  Keystore) and are never written to insecure storage as a fallback.
- The menu-reading request is built to carry only the cleaned image and a fixed prompt; our server **rejects**
  any request that attempts to attach personal data.
- Secrets/API keys are held only server-side, never in the mobile app.
- Server storage uses EU-jurisdiction Cloudflare D1/R2.

No method of transmission or storage is perfectly secure; we cannot guarantee absolute security.

---

## 12. Changes to this policy

We may update this policy as the app evolves (for example, when real billing is enabled or when on-device face
detection ships). We will post the updated version with a new "Last updated" date and, where required,
notify users in-app. [OWNER + LAWYER: define the change-notification mechanism.]

---

## 13. Contact

Questions or requests about this policy or your data:

- **Email:** [OWNER: privacy contact email]
- **Postal:** [OWNER: registered address]

---

*This is a draft template grounded in Bocado's current implementation. It must be reviewed and finalized by the
owner and a qualified data-protection lawyer — especially for Article 9 health-data processing, children's
data, sub-processor DPAs, and the EU/Spain jurisdiction specifics — before it is published or relied upon.*
