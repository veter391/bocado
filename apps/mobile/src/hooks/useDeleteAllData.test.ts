/**
 * Unit tests for the PURE GDPR Art. 17 erasure orchestration (`runDeleteAllData`).
 *
 * NODE-only: drives the orchestration through injected fakes — no React, no native
 * modules, no `useDeleteAllData` hook (that needs the provider tree). The guarantees:
 *
 *   1. Every domain is wiped in ONE call: profile, saved dishes, reminders-off, history.
 *   2. One domain failing must NOT abort the others (isolated best-effort) — a thrown
 *      sync wipe and a rejected async erasure both still let the rest run.
 *   3. It never throws, and resolves only once all async erasures have settled.
 */
import { describe, expect, it, vi } from 'vitest';

import { runDeleteAllData, type DeleteAllDataDeps } from './useDeleteAllData';

function makeDeps(over: Partial<DeleteAllDataDeps> = {}): {
  deps: DeleteAllDataDeps;
  calls: Record<keyof DeleteAllDataDeps, ReturnType<typeof vi.fn>>;
} {
  const calls = {
    clearProfile: vi.fn(),
    clearSavedDishes: vi.fn(),
    disableReminders: vi.fn(async () => undefined),
    clearScanHistory: vi.fn(async () => undefined),
  };
  const deps: DeleteAllDataDeps = {
    clearProfile: calls.clearProfile,
    clearSavedDishes: calls.clearSavedDishes,
    disableReminders: calls.disableReminders,
    clearScanHistory: calls.clearScanHistory,
    ...over,
  };
  return { deps, calls };
}

describe('runDeleteAllData', () => {
  it('wipes every data domain in a single call', async () => {
    const { deps, calls } = makeDeps();
    await runDeleteAllData(deps);
    expect(calls.clearProfile).toHaveBeenCalledTimes(1);
    expect(calls.clearSavedDishes).toHaveBeenCalledTimes(1);
    expect(calls.disableReminders).toHaveBeenCalledTimes(1);
    expect(calls.clearScanHistory).toHaveBeenCalledTimes(1);
  });

  it('still runs the other domains when a synchronous wipe throws', async () => {
    const { deps, calls } = makeDeps({
      clearProfile: vi.fn(() => {
        throw new Error('keystore locked');
      }),
    });
    await expect(runDeleteAllData(deps)).resolves.toBeUndefined();
    expect(calls.clearSavedDishes).toHaveBeenCalledTimes(1);
    expect(calls.disableReminders).toHaveBeenCalledTimes(1);
    expect(calls.clearScanHistory).toHaveBeenCalledTimes(1);
  });

  it('settles all async erasures even when one rejects (offline server)', async () => {
    const { deps, calls } = makeDeps({
      clearScanHistory: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    await expect(runDeleteAllData(deps)).resolves.toBeUndefined();
    // The reminder opt-out still ran despite the history erasure rejecting.
    expect(calls.disableReminders).toHaveBeenCalledTimes(1);
    expect(calls.clearProfile).toHaveBeenCalledTimes(1);
    expect(calls.clearSavedDishes).toHaveBeenCalledTimes(1);
  });

  it('never throws even if every domain fails', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const reject = async () => {
      throw new Error('boom');
    };
    const { deps } = makeDeps({
      clearProfile: vi.fn(boom),
      clearSavedDishes: vi.fn(boom),
      disableReminders: vi.fn(reject),
      clearScanHistory: vi.fn(reject),
    });
    await expect(runDeleteAllData(deps)).resolves.toBeUndefined();
  });
});
