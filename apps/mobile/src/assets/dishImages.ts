/**
 * Dish thumbnail assets for the list/detail.
 *
 * DEMO/PLACEHOLDER set: a small bundle of appetizing food images (generated once
 * via Higgsfield, optimized to 360px). In the real product these are replaced by
 * per-dish images generated lazily on the Worker (FLUX/Nano Banana) and cached
 * globally in R2 — see ARCHITECTURE.md. Here they let the UI show the free vs Pro
 * experience without any runtime generation:
 *   - FREE  → a BLURRED placeholder (you can tell it's a dish, not what it is) +
 *             a lock + "AI" badge — the upsell tease. Costs us nothing.
 *   - PRO   → the SHARP image. (Still labeled "AI illustration" per EU AI Act.)
 *
 * Every generated image stays labeled as AI (AIBadge) in BOTH tiers.
 */
import type { ImageSourcePropType } from 'react-native';

const SHARP: ImageSourcePropType[] = [
  require('../../assets/dishes/placeholder-1.jpg'),
  require('../../assets/dishes/placeholder-2.jpg'),
  require('../../assets/dishes/placeholder-3.jpg'),
  require('../../assets/dishes/placeholder-4.jpg'),
];
const BLUR: ImageSourcePropType[] = [
  require('../../assets/dishes/placeholder-1-blur.jpg'),
  require('../../assets/dishes/placeholder-2-blur.jpg'),
  require('../../assets/dishes/placeholder-3-blur.jpg'),
  require('../../assets/dishes/placeholder-4-blur.jpg'),
];
const CARBONARA: ImageSourcePropType = require('../../assets/dishes/carbonara.jpg');
const CARBONARA_BLUR: ImageSourcePropType = require('../../assets/dishes/carbonara-blur.jpg');

export interface DishThumb {
  source: ImageSourcePropType;
  /** True when this is the blurred free-tier placeholder (lock the thumbnail). */
  blurred: boolean;
}

/**
 * Pick a thumbnail for a dish. `isPro` → sharp; otherwise the blurred placeholder.
 * Carbonara has a matching image; the rest cycle the appetizing placeholder set.
 */
export function dishThumb(name: string, index: number, isPro: boolean): DishThumb {
  const isCarbonara = /carbonara/i.test(name);
  const i = ((index % SHARP.length) + SHARP.length) % SHARP.length;
  if (isPro) {
    return { source: isCarbonara ? CARBONARA : SHARP[i]!, blurred: false };
  }
  return { source: isCarbonara ? CARBONARA_BLUR : BLUR[i]!, blurred: true };
}
