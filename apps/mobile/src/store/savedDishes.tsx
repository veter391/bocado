/**
 * Saved-dishes store — the on-device bookmark list backing the dish "save" affordance.
 *
 * `useSavedDishes()` exposes the saved refs plus the small set of mutations the
 * bookmark button and the saved-list surface drive. The shape mirrors the profile /
 * entitlement stores: a plain React Context (zustand is not a dependency), hydrated
 * ONCE on mount with an active guard, and persisted on change only after hydration so
 * the empty default never clobbers a stored list before the read completes.
 *
 * PRIVACY (SECURITY.md §1 / §A): saved dishes are FULLY ON-DEVICE. Nothing here ever
 * touches the network — there is no server endpoint and no `/menus` extension. The
 * refs are minimal + anonymous (see {@link SavedDishRef}); the full dish is re-read
 * from the menu cache on open. `clear()` is part of the GDPR Art. 17 erasure path.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import {
  deleteSavedDishes,
  loadSavedDishes,
  saveSavedDishes,
  savedDishKey,
  type SavedDishRef,
} from './savedDishesStorage';

export type { SavedDishRef } from './savedDishesStorage';

/** Delay before a change is flushed to secure storage, to coalesce rapid toggles. */
const PERSIST_DEBOUNCE_MS = 400;

interface SavedDishesState {
  /** Saved refs, newest first. */
  saved: SavedDishRef[];
  /** False until the on-device store has been read once on mount. */
  hydrated: boolean;
}

const initialState: SavedDishesState = { saved: [], hydrated: false };

type SavedDishesAction =
  | { type: 'hydrate'; saved: SavedDishRef[] }
  | { type: 'toggle'; ref: SavedDishRef }
  | { type: 'remove'; menuId: string; dishId: string }
  | { type: 'clear' };

function reducer(state: SavedDishesState, action: SavedDishesAction): SavedDishesState {
  switch (action.type) {
    case 'hydrate':
      return { saved: action.saved, hydrated: true };
    case 'toggle': {
      const key = savedDishKey(action.ref.menuId, action.ref.dishId);
      const exists = state.saved.some((s) => savedDishKey(s.menuId, s.dishId) === key);
      // Toggle off when already saved; otherwise prepend (newest first).
      return {
        ...state,
        saved: exists
          ? state.saved.filter((s) => savedDishKey(s.menuId, s.dishId) !== key)
          : [action.ref, ...state.saved],
      };
    }
    case 'remove': {
      const key = savedDishKey(action.menuId, action.dishId);
      return {
        ...state,
        saved: state.saved.filter((s) => savedDishKey(s.menuId, s.dishId) !== key),
      };
    }
    case 'clear':
      return { ...state, saved: [] };
    default:
      return state;
  }
}

export interface SavedDishesStore {
  /** The saved refs, newest first. */
  saved: SavedDishRef[];
  /** True once the on-device list has been loaded. Callers gate UI (e.g. the bookmark) on this. */
  hydrated: boolean;
  /** Whether a given dish is currently saved — the selector the bookmark reads. */
  isSaved: (menuId: string, dishId: string) => boolean;
  /** Save the dish if not saved, or remove it if already saved. */
  toggle: (ref: SavedDishRef) => void;
  /** Remove a specific saved dish (used by the saved-list remove control). */
  remove: (menuId: string, dishId: string) => void;
  /** GDPR erasure: wipe the saved list on-device and reset in-memory state. */
  clear: () => void;
}

const SavedDishesContext = createContext<SavedDishesStore | null>(null);

export function SavedDishesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { saved, hydrated } = state;

  // Hydrate once on mount from secure storage. Guarded against a late update if the
  // provider unmounts mid-read.
  useEffect(() => {
    let active = true;
    void loadSavedDishes().then((stored) => {
      if (active) dispatch({ type: 'hydrate', saved: stored });
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist on every change once hydrated (never before — that would clobber the
  // stored list with the empty default). Debounced to coalesce rapid toggles, and
  // flushed on unmount so the last change is not lost.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveSavedDishes(saved);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void saveSavedDishes(saved);
      }
    };
  }, [saved, hydrated]);

  const isSaved = useCallback(
    (menuId: string, dishId: string) => {
      const key = savedDishKey(menuId, dishId);
      return saved.some((s) => savedDishKey(s.menuId, s.dishId) === key);
    },
    [saved],
  );

  const toggle = useCallback((ref: SavedDishRef) => dispatch({ type: 'toggle', ref }), []);
  const remove = useCallback(
    (menuId: string, dishId: string) => dispatch({ type: 'remove', menuId, dishId }),
    [],
  );
  const clear = useCallback(() => {
    // Cancel any pending write so the debounced flush cannot resurrect erased data.
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    dispatch({ type: 'clear' });
    void deleteSavedDishes();
  }, []);

  const value = useMemo<SavedDishesStore>(
    () => ({ saved, hydrated, isSaved, toggle, remove, clear }),
    [saved, hydrated, isSaved, toggle, remove, clear],
  );

  return <SavedDishesContext.Provider value={value}>{children}</SavedDishesContext.Provider>;
}

export function useSavedDishes(): SavedDishesStore {
  const ctx = useContext(SavedDishesContext);
  if (!ctx) {
    throw new Error('useSavedDishes must be used within a <SavedDishesProvider>.');
  }
  return ctx;
}
