/**
 * Local user-profile store.
 *
 * NOTE: zustand is NOT in the mobile package's dependencies, so per the task's
 * fallback this is a plain React Context store (no extra dependency). It keeps
 * the exact same shape a zustand store would, so swapping later is mechanical.
 *
 * Privacy: allergies are GDPR Art. 9 health data. They are only retained once the
 * user gives explicit, unbundled consent (`consentHealthDataAt` set).
 *
 * Persistence (on-device, EU): the profile is written to the OS secure keystore via
 * `expo-secure-store` under `bocado.profile.v1` (see `./profileStorage`). It is
 * hydrated once on mount; until then `hydrated` is `false` and `profile` is the safe
 * empty value. Every subsequent change is persisted (debounced). Nothing here is ever
 * sent to a server or model — health data stays on the device (SECURITY.md §A).
 * `clear()` is the GDPR Art. 17 erasure path: it wipes the stored record and the
 * in-memory state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type { AllergenId, DietId, GoalId, UserProfile } from '@bocado/shared';
import { deleteProfile, emptyProfile, loadProfile, saveProfile } from './profileStorage';

/** Delay before a change is flushed to secure storage, to coalesce rapid edits. */
const PERSIST_DEBOUNCE_MS = 400;

interface ProfileState {
  profile: UserProfile;
  /** False until the on-device store has been read once on mount. */
  hydrated: boolean;
}

const initialState: ProfileState = {
  profile: emptyProfile,
  hydrated: false,
};

type ProfileAction =
  | { type: 'hydrate'; profile: UserProfile }
  | { type: 'setDiet'; diet: DietId }
  | { type: 'toggleAllergy'; allergy: AllergenId }
  | { type: 'toggleGoal'; goal: GoalId }
  | { type: 'setOtherNotes'; notes: string }
  | { type: 'grantHealthConsent' }
  | { type: 'revokeHealthConsent' }
  | { type: 'reset' }
  | { type: 'clear' };

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function reducer(state: ProfileState, action: ProfileAction): ProfileState {
  switch (action.type) {
    case 'hydrate':
      // Adopt the stored value and mark the store ready. Runs exactly once on mount.
      return { profile: action.profile, hydrated: true };
    case 'setDiet':
      return { ...state, profile: { ...state.profile, diet: action.diet } };
    case 'toggleAllergy': {
      // Guard: never collect allergies without active consent. Stamp the consent
      // timestamp the first time allergy health data is actually set under consent.
      if (!state.profile.consentHealthDataAt) return state;
      const allergies = toggle(state.profile.allergies, action.allergy);
      const consentHealthDataAt =
        state.profile.consentHealthDataAt ?? new Date().toISOString();
      return { ...state, profile: { ...state.profile, allergies, consentHealthDataAt } };
    }
    case 'toggleGoal':
      return {
        ...state,
        profile: { ...state.profile, goals: toggle(state.profile.goals, action.goal) },
      };
    case 'setOtherNotes': {
      // `otherNotes` is free text that may describe a health condition, so it is
      // Art. 9 health data: only retain it under active consent, and drop to
      // undefined when blank so we never persist an empty string.
      if (!state.profile.consentHealthDataAt) return state;
      const trimmed = action.notes.trim();
      return {
        ...state,
        profile: { ...state.profile, otherNotes: trimmed.length > 0 ? trimmed : undefined },
      };
    }
    case 'grantHealthConsent':
      return {
        ...state,
        profile: { ...state.profile, consentHealthDataAt: new Date().toISOString() },
      };
    case 'revokeHealthConsent':
      // Revoking consent also drops the data it covered (Art. 5 minimization):
      // both the allergy list and the free-text health note.
      return {
        ...state,
        profile: {
          ...state.profile,
          consentHealthDataAt: undefined,
          allergies: [],
          otherNotes: undefined,
        },
      };
    case 'reset':
      return { ...state, profile: emptyProfile };
    case 'clear':
      // GDPR Art. 17 erasure: back to the safe empty value in memory; the stored
      // record is wiped by the action creator (see `clear` below).
      return { ...state, profile: emptyProfile };
    default:
      return state;
  }
}

export interface ProfileStore {
  profile: UserProfile;
  /** True once the on-device profile has been loaded. Callers may gate UI on this. */
  hydrated: boolean;
  hasHealthConsent: boolean;
  setDiet: (diet: DietId) => void;
  toggleAllergy: (allergy: AllergenId) => void;
  toggleGoal: (goal: GoalId) => void;
  /** Set the free-text "anything else" note. No-op without active health consent. */
  setOtherNotes: (notes: string) => void;
  grantHealthConsent: () => void;
  revokeHealthConsent: () => void;
  reset: () => void;
  /** GDPR erasure: wipe stored health data on-device and reset the in-memory profile. */
  clear: () => void;
}

const ProfileContext = createContext<ProfileStore | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { profile, hydrated } = state;

  // Hydrate once on mount from secure storage. Guarded against late updates if the
  // provider unmounts mid-read.
  useEffect(() => {
    let active = true;
    void loadProfile().then((stored) => {
      if (active) dispatch({ type: 'hydrate', profile: stored });
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist on every change once hydrated (never before — that would clobber the
  // stored value with the empty default). Debounced to coalesce rapid edits, and
  // flushed on unmount so the last change is not lost.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveProfile(profile);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void saveProfile(profile);
      }
    };
  }, [profile, hydrated]);

  const setDiet = useCallback((diet: DietId) => dispatch({ type: 'setDiet', diet }), []);
  const toggleAllergy = useCallback(
    (allergy: AllergenId) => dispatch({ type: 'toggleAllergy', allergy }),
    [],
  );
  const toggleGoal = useCallback((goal: GoalId) => dispatch({ type: 'toggleGoal', goal }), []);
  const setOtherNotes = useCallback(
    (notes: string) => dispatch({ type: 'setOtherNotes', notes }),
    [],
  );
  const grantHealthConsent = useCallback(() => dispatch({ type: 'grantHealthConsent' }), []);
  const revokeHealthConsent = useCallback(() => dispatch({ type: 'revokeHealthConsent' }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const clear = useCallback(() => {
    // Cancel any pending write so the debounced flush cannot resurrect erased data.
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    dispatch({ type: 'clear' });
    void deleteProfile();
  }, []);

  const value = useMemo<ProfileStore>(
    () => ({
      profile,
      hydrated,
      hasHealthConsent: Boolean(profile.consentHealthDataAt),
      setDiet,
      toggleAllergy,
      toggleGoal,
      setOtherNotes,
      grantHealthConsent,
      revokeHealthConsent,
      reset,
      clear,
    }),
    [
      profile,
      hydrated,
      setDiet,
      toggleAllergy,
      toggleGoal,
      setOtherNotes,
      grantHealthConsent,
      revokeHealthConsent,
      reset,
      clear,
    ],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileStore {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a <ProfileProvider>.');
  }
  return ctx;
}
