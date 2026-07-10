/**
 * Per-nutrient TRAFFIC LIGHT — the Yuka-style green/amber/red row, computed
 * deterministically over a {@link NutritionEstimate}.
 *
 * Like the rest of the TRUST CORE this is pure and deterministic: same estimate ->
 * same lights. It invents nothing — it only re-reads numbers the compute layer
 * already produced. Each nutrient is judged on the MIDPOINT of its range
 * (`m = (min + max) / 2`), the single figure that represents "the estimate".
 *
 * ── ANCHORING THE BANDS (NO INVENTED THRESHOLDS) ────────────────────────────
 * A single restaurant dish is treated as ONE PORTION (>100 g). The only cutoffs
 * that trace to a citable public standard are the four RED lines for fat,
 * saturated fat, sugars and salt — they are the UK FSA / DoH 2016 front-of-pack
 * per-portion "HIGH" lines, i.e. >30% of the EU Reg (EU) 1169/2011 Annex XIII
 * Reference Intake (RI) for an adult/day:
 *   - fat       RI 70 g  -> red > 21 g   (30% × 70)
 *   - saturates RI 20 g  -> red > 6 g    (30% × 20)
 *   - sugars    RI 90 g  -> red > 27 g   (30% × 90)  [TOTAL sugars; see note]
 *   - salt      RI 6 g   -> red > 1.8 g  (30% × 6)
 *
 * EVERYTHING ELSE here is **Bocado guidance — NOT an FSA/EU band**:
 *   - the GREEN ceilings (set at 10% RI, one-third of the way to the red line),
 *   - the AMBER band (the span between green and red),
 *   - the ENERGY light entirely (FSA defines NO energy light): green ≤600,
 *     amber ≤800, red >800 kcal, declared Bocado guidance off the 2000 kcal RI,
 *   - the PROTEIN light entirely (FSA defines NO protein light): a POSITIVE
 *     nutrient, judged against the 50 g protein RI, that never reads red.
 * FSA defines NO per-portion green/amber band of its own, so we MUST NOT cite it
 * for any green ceiling or amber edge — only for the four red lines above. The UI
 * footnote MUST mark the energy + protein lights as "Bocado guidance (not an FSA
 * label)" (see DESIGN.md / SPEC §DISCLAIMER REQUIREMENT).
 *
 * SUGAR IS TOTAL SUGARS: the engine cannot separate intrinsic (fruit/milk) from
 * free sugars from a menu name, so the sugar light reflects TOTAL sugars incl.
 * natural fruit/milk sugars. A fruit- or dairy-dominated dish can therefore read
 * red on sugar honestly — this is a documented limitation, and the verdict layer
 * de-risks it so a fruit bowl never reads "Best avoided" on sugar alone.
 *
 * WHO/EFSA cross-checks (orientation only, not the cutoff source): WHO free
 * sugars <~50 g/day and salt <5 g/day mean a >27 g-sugar or >1.8 g-salt dish
 * already spends a large share of a whole-day budget — so the FSA red lines read
 * as honest, not alarmist. EFSA treats saturates "as low as possible" (no UL),
 * which is why the (Bocado) green ceiling for saturates sits low.
 *
 * These thresholds are GUIDANCE for orientation, NOT medical advice and NOT a
 * per-100 g regulatory claim.
 *
 * Direction:
 *  - For "less is better" nutrients (calories, fat, satFat, sugar, salt) the bands
 *    run good -> caution -> high as the midpoint rises.
 *  - Protein is POSITIVE (more is better): it is never `high`/red. A low protein
 *    figure is a soft `caution`, not a warning, and a generous figure is `good`.
 *
 * Only nutrients PRESENT on the estimate get a light. `kcal`, `protein`, `fat` and
 * `salt` are always present; `satFat` and `sugar` are optional and are SKIPPED when
 * absent — we never fabricate a value to fill a row.
 *
 * fillPct is LOCKED, presentational, and DECOUPLED from these thresholds (the
 * EstimateBar geometry is a locked design surface and the %RI-bar idea is an open
 * design question). Re-anchoring the band cutoffs here does NOT change `full`.
 */
import type { NutrientLight, NutritionEstimate, Range } from '@bocado/shared';

/** Midpoint of a nutrient range — the single figure each band is judged on. */
function mid(range: Range): number {
  return (range.min + range.max) / 2;
}

/**
 * Map a midpoint onto a 5..100 bar fill, where `full` is the value that reads as a
 * "full bar". Clamped to a 5% floor so a present-but-tiny nutrient is still visible,
 * and a 100% ceiling so an extreme dish does not overflow the bar.
 *
 * LOCKED: `full` values are the EstimateBar's presentational scale, NOT the band
 * cutoffs. They are intentionally unchanged by the threshold re-anchoring.
 */
function fillPct(m: number, full: number): number {
  const pct = (m / full) * 100;
  if (pct < 5) return 5;
  if (pct > 100) return 100;
  return pct;
}

interface BandResult {
  level: NutrientLight['level'];
  tag: string;
}

/**
 * Classify a "less is better" nutrient into good/caution/high by its midpoint.
 *
 * Boundary convention (pinned by tests):
 *   - `m <= goodAtOrBelow`      -> good   ('Low')   — the green ceiling (10% RI).
 *   - `goodAtOrBelow < m <= redAtOrBelow` -> caution ('Mid') — the amber band.
 *   - `m > redAtOrBelow`        -> high   ('High')  — the FSA per-portion red line.
 *
 * Only `redAtOrBelow` traces to a standard (FSA >30% RI). `goodAtOrBelow` is
 * Bocado guidance (10% RI). Inclusive at both edges keeps the red line itself
 * (e.g. salt 1.8 g) as the last AMBER value, with anything above it red.
 */
function negativeBand(m: number, goodAtOrBelow: number, redAtOrBelow: number): BandResult {
  if (m <= goodAtOrBelow) return { level: 'good', tag: 'Low' };
  if (m <= redAtOrBelow) return { level: 'caution', tag: 'Mid' };
  return { level: 'high', tag: 'High' };
}

/**
 * Build a {@link NutrientLight} for a single nutrient.
 *
 * `band` already encodes the level + tag for the nutrient's value, so this just
 * stamps the shared, presentational fields (key, label, range, fillPct, positive).
 */
function light(
  key: NutrientLight['key'],
  label: string,
  range: Range,
  band: BandResult,
  full: number,
  positive: boolean,
): NutrientLight {
  return {
    key,
    label,
    level: band.level,
    tag: band.tag,
    range,
    fillPct: fillPct(mid(range), full),
    positive,
  };
}

/**
 * Rate every PRESENT nutrient of an estimate into a traffic-light row.
 *
 * Order is fixed and stable: calories, protein, fat, satFat, sugar, salt — so the UI
 * can render the rows without sorting and snapshots stay deterministic. Optional
 * nutrients absent on the estimate (`satFat`, `sugar`) are omitted, never invented.
 *
 * @param estimate the deterministic per-portion nutrition estimate (ranges).
 * @returns the ordered list of per-nutrient lights for the present nutrients.
 */
export function rateNutrients(estimate: NutritionEstimate): NutrientLight[] {
  const lights: NutrientLight[] = [];

  // calories (kcal) — always present. BOCADO GUIDANCE, not an FSA light (FSA has
  //   no energy light). Off the EU RI of 2000 kcal: green <=600 (a normal main),
  //   amber <=800, red >800 (>40% RI — heavy for a single meal). full LOCKED at 900.
  {
    const m = mid(estimate.kcal);
    const band = negativeBand(m, 600, 800);
    lights.push(light('calories', 'Calories', estimate.kcal, band, 900, false));
  }

  // protein — always present. POSITIVE: never high/red. BOCADO GUIDANCE, not an
  //   FSA light. Off the EU RI of 50 g: good >=15 g (>=30% RI, a substantial
  //   serving); 7.5..15 caution/'OK'; <7.5 caution/'Low'. Protein can never launder
  //   a red elsewhere — it only ever earns green or a soft amber. full LOCKED at 40.
  {
    const m = mid(estimate.protein);
    let band: BandResult;
    if (m >= 15) band = { level: 'good', tag: 'Good' };
    else if (m >= 7.5) band = { level: 'caution', tag: 'OK' };
    else band = { level: 'caution', tag: 'Low' };
    lights.push(light('protein', 'Protein', estimate.protein, band, 40, true));
  }

  // fat — always present. RED >21 g = FSA per-portion HIGH line (30% × 70 g RI).
  //   green <=7 g (10% RI) is BOCADO GUIDANCE. full LOCKED at 55.
  {
    const m = mid(estimate.fat);
    const band = negativeBand(m, 7, 21);
    lights.push(light('fat', 'Fat', estimate.fat, band, 55, false));
  }

  // satFat — OPTIONAL. RED >6 g = FSA per-portion HIGH line (30% × 20 g RI).
  //   green <=2 g (10% RI) is BOCADO GUIDANCE (EFSA: saturates "as low as possible",
  //   no UL — hence the low ceiling). full LOCKED at 22.
  if (estimate.satFat) {
    const m = mid(estimate.satFat);
    const band = negativeBand(m, 2, 6);
    lights.push(light('satFat', 'Saturated fat', estimate.satFat, band, 22, false));
  }

  // sugar — OPTIONAL. TOTAL sugars (incl. natural fruit/milk sugars). RED >27 g =
  //   FSA per-portion HIGH line (30% × 90 g RI). green <=9 g (10% RI) is BOCADO
  //   GUIDANCE. full LOCKED at 40.
  if (estimate.sugar) {
    const m = mid(estimate.sugar);
    const band = negativeBand(m, 9, 27);
    lights.push(light('sugar', 'Sugar', estimate.sugar, band, 40, false));
  }

  // salt — always present. RED >1.8 g = FSA per-portion HIGH line (30% × 6 g RI).
  //   green <=0.6 g (10% RI) is BOCADO GUIDANCE. full LOCKED at 3.
  {
    const m = mid(estimate.salt);
    const band = negativeBand(m, 0.6, 1.8);
    lights.push(light('salt', 'Salt', estimate.salt, band, 3, false));
  }

  return lights;
}
