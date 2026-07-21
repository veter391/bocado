/**
 * A tiny debounced persister: coalesce rapid `schedule(value)` calls into ONE `save`
 * after a quiet period, and `flush()` the pending value immediately (used on unmount so
 * the last edit is never lost).
 *
 * Why this exists as its own unit: the stores previously debounced inline in a
 * `useEffect` whose CLEANUP called `save(state)`. React runs an effect's cleanup before
 * EVERY re-run (not only on unmount), so each edit triggered an immediate write of the
 * previous value — defeating the debounce (excess keystore I/O on every keystroke/toggle).
 * Extracting the logic here makes it correct AND unit-testable without rendering a RN
 * component: `schedule` never writes synchronously, only the trailing timer (or an
 * explicit `flush`) does.
 *
 * Pure except for the injected `save` and the timer; no React, no storage, no clock math.
 */
export interface DebouncedPersister<T> {
  /** Record a new value; (re)arms the trailing timer. Never writes synchronously. */
  schedule: (value: T) => void;
  /** Write the pending value now (if any) and cancel the timer. Safe to call repeatedly. */
  flush: () => void;
  /**
   * DISCARD the pending value and cancel the timer WITHOUT writing. Used on erase/clear so
   * a queued write of just-deleted data can't resurrect it after the store is wiped.
   */
  cancel: () => void;
}

export function createDebouncedPersister<T>(
  save: (value: T) => void | Promise<void>,
  delayMs: number,
): DebouncedPersister<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hasPending = false;
  let pending: T;

  function writePending(): void {
    if (!hasPending) return;
    const value = pending;
    hasPending = false;
    void save(value);
  }

  return {
    schedule(value: T) {
      pending = value;
      hasPending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        writePending();
      }, delayMs);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      writePending();
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      hasPending = false;
    },
  };
}
