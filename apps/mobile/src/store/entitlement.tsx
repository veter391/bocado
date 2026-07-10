/**
 * Entitlement store — the single source of truth for FREE vs PRO.
 *
 * `useEntitlement()` exposes the user's tier and the two purchase actions the
 * paywall drives. The shape is provider-agnostic on purpose so a real billing
 * backend drops in behind it without touching any screen.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * MOCK BILLING — READ BEFORE SHIPPING
 * ──────────────────────────────────────────────────────────────────────────
 * `startPurchase()` / `restore()` here are an IN-MEMORY MOCK. They flip the tier
 * to 'pro' after a short delay so the FREE/PRO experience is fully testable on
 * device today. There is NO real money movement and NO receipt validation.
 *
 * Real billing is store + keys gated (App Store / Play IAP, or RevenueCat, or
 * Stripe) and is out of scope until the owner provides the storefront + API
 * keys. When that lands, replace ONLY the body of `runPurchase` / `runRestore`
 * below with the provider SDK calls (e.g. RevenueCat `Purchases.purchasePackage`
 * + `getCustomerInfo`); the context surface and every consumer stay unchanged.
 *
 * PERSISTENCE: the tier is cached ON-DEVICE in the OS secure keystore via
 * `expo-secure-store` (see `./entitlementStorage`, mirroring `./profileStorage`), so a
 * returning user keeps Pro across cold starts with no network round-trip. It is read
 * once on mount; until then `hydrated` is false and the tier is the safe default
 * 'free'. Every subsequent tier change is persisted. This cache is a convenience, NOT
 * proof of purchase — the authoritative entitlement still comes from the billing
 * provider (RevenueCat/IAP) via the `runPurchase`/`runRestore` seam, which a real
 * `restore()` re-validates. Server-side entitlement tied to an account (so Pro crosses
 * devices / survives reinstalls) remains a deliberate follow-up.
 * ──────────────────────────────────────────────────────────────────────────
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { loadTier, saveTier, type EntitlementTier } from './entitlementStorage';

export type { EntitlementTier } from './entitlementStorage';

/** Billing plans the paywall can offer. */
export type PurchasePlan = 'monthly' | 'annual';

/**
 * Web-only dev/preview override: open with `?pro=1` to start in the Pro tier and
 * preview the Pro experience (sharp dish images, unlocked filters). No-op on
 * native — there the tier always starts 'free' and is granted via purchase.
 */
function initialTier(): EntitlementTier {
  // DEV ONLY: the `?pro=1` preview override is gated behind __DEV__ so it can NEVER
  // unlock Pro in a production build (in prod __DEV__ is false → this whole block is
  // dead and the URL cannot bypass the paywall). Real entitlement is owned by the
  // billing provider (RevenueCat/IAP receipt) — see runPurchase/runRestore.
  if (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    typeof window !== 'undefined' &&
    typeof window.location !== 'undefined'
  ) {
    const v = new URLSearchParams(window.location.search).get('pro');
    if (v === '1' || v === 'true') return 'pro';
  }
  return 'free';
}

/** How long the mock pretends to talk to the store, so the UI shows real pending state. */
const MOCK_PURCHASE_DELAY_MS = 900;

export interface EntitlementStore {
  tier: EntitlementTier;
  /** Convenience flag — `tier === 'pro'`. */
  isPro: boolean;
  /** False until the on-device tier cache has been read once on mount. */
  hydrated: boolean;
  /** True while a purchase or restore is in flight (drives button spinners / disabled state). */
  pending: boolean;
  /**
   * Begin a purchase for `plan`. Resolves once the user is Pro; rejects if the
   * purchase fails or is cancelled. MOCK: resolves to Pro after a short delay.
   */
  startPurchase: (plan: PurchasePlan) => Promise<void>;
  /**
   * Restore a previously-bought entitlement. MOCK: grants Pro after a short delay.
   * The real impl reads the active entitlement from the provider's receipt.
   */
  restore: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementStore | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<EntitlementTier>(initialTier);
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(false);
  // Guard against overlapping purchase/restore taps resolving onto a stale state.
  const inFlight = useRef(false);

  // Hydrate the cached tier once on mount. The DEV `?pro=1` override (already applied
  // by `initialTier`) wins — never downgrade a deliberately-previewed Pro session to a
  // stored 'free'. A stored 'pro', however, restores Pro for a returning real user.
  useEffect(() => {
    let active = true;
    void loadTier().then((stored) => {
      if (!active) return;
      if (stored === 'pro') setTier('pro');
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist on every tier change once hydrated (never before — that would clobber a
  // stored 'pro' with the initial 'free' before the read completes).
  useEffect(() => {
    if (!hydrated) return;
    void saveTier(tier);
  }, [tier, hydrated]);

  // ── Provider seam ────────────────────────────────────────────────────────
  // Swap the body of these two for the real billing SDK; keep the signatures.
  const runPurchase = useCallback(async (_plan: PurchasePlan): Promise<void> => {
    // MOCK: simulate the store round-trip, then unlock Pro.
    await new Promise<void>((resolve) => setTimeout(resolve, MOCK_PURCHASE_DELAY_MS));
    setTier('pro');
  }, []);

  const runRestore = useCallback(async (): Promise<void> => {
    // MOCK: pretend a prior purchase was found and restore Pro.
    await new Promise<void>((resolve) => setTimeout(resolve, MOCK_PURCHASE_DELAY_MS));
    setTier('pro');
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const guarded = useCallback(
    async (run: () => Promise<void>): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      try {
        await run();
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [],
  );

  const startPurchase = useCallback(
    (plan: PurchasePlan) => guarded(() => runPurchase(plan)),
    [guarded, runPurchase],
  );

  const restore = useCallback(() => guarded(() => runRestore()), [guarded, runRestore]);

  const value = useMemo<EntitlementStore>(
    () => ({
      tier,
      isPro: tier === 'pro',
      hydrated,
      pending,
      startPurchase,
      restore,
    }),
    [tier, hydrated, pending, startPurchase, restore],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementStore {
  const ctx = useContext(EntitlementContext);
  if (!ctx) {
    throw new Error('useEntitlement must be used within an <EntitlementProvider>.');
  }
  return ctx;
}
