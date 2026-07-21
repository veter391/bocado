import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebouncedPersister } from './debouncedPersister';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createDebouncedPersister', () => {
  it('coalesces rapid schedules into ONE trailing save of the LAST value', () => {
    const save = vi.fn();
    const p = createDebouncedPersister<number>(save, 400);

    p.schedule(1);
    p.schedule(2);
    p.schedule(3);
    // Nothing written yet — debounce is trailing-only, never synchronous.
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(399);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    // Exactly one write, of the last value — the earlier stale values never hit storage.
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
  });

  it('writes again only after another quiet period', () => {
    const save = vi.fn();
    const p = createDebouncedPersister<string>(save, 100);

    p.schedule('a');
    vi.advanceTimersByTime(100);
    p.schedule('b');
    vi.advanceTimersByTime(100);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, 'a');
    expect(save).toHaveBeenNthCalledWith(2, 'b');
  });

  it('flush writes the pending value immediately and cancels the timer (no double write)', () => {
    const save = vi.fn();
    const p = createDebouncedPersister<number>(save, 400);

    p.schedule(7);
    p.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(7);

    // The cancelled timer must not fire a second write.
    vi.advanceTimersByTime(400);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending is a no-op', () => {
    const save = vi.fn();
    const p = createDebouncedPersister<number>(save, 400);
    p.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('cancel discards the pending value WITHOUT writing (erase must not resurrect data)', () => {
    const save = vi.fn();
    const p = createDebouncedPersister<number>(save, 400);
    p.schedule(42);
    p.cancel();
    // Neither immediately nor when the (cancelled) timer would have fired.
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('does not re-write an already-flushed value on a later flush', () => {
    const save = vi.fn();
    const p = createDebouncedPersister<number>(save, 400);
    p.schedule(1);
    p.flush();
    p.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
