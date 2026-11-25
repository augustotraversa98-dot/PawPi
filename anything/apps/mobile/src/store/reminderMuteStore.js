import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// "Remind me about this dog" (PR5b 1D). A per-person, per-phone choice — nothing goes to the server, and the other
// members of a shared dog are not affected. Default ON, so only the switched-OFF dogs are stored, per signed-in user
// (two accounts on one phone keep their own choice).
//
// OFF means: this phone arms no local alert for that dog (routine reminders, snoozes, its nudges). Today still lists
// everything.

let hydrated = false;
const waiters = [];

const useReminderMuteStore = create(
  persist(
    (set) => ({
      mutedByUser: {}, // { [userKey]: ["7", …] }
      setDogMuted: (userKey, petId, muted) =>
        set((state) => {
          const id = String(petId);
          const others = (state.mutedByUser[userKey] ?? []).filter((x) => x !== id);
          return {
            mutedByUser: { ...state.mutedByUser, [userKey]: muted ? [...others, id] : others },
          };
        }),
    }),
    {
      name: "pawpi:reminderMutes",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mutedByUser: state.mutedByUser }),
      // Called once the stored value was read (or reading it failed).
      onRehydrateStorage: () => () => {
        hydrated = true;
        for (const resolve of waiters.splice(0)) resolve();
      },
    },
  ),
);

/** Resolves once the stored choices are in memory. Nothing may be armed before that. */
export function whenReminderMutesReady() {
  if (hydrated) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}

/** Are the stored choices in memory yet? (Before that, "not muted" is only the default, so a caller that wants to SKIP work for a muted dog must not trust it.) */
export function reminderMutesKnown() {
  return hydrated;
}

/** The key of the signed-in person ("anon" when nobody is). */
export function reminderUserKey() {
  // Required lazily: the auth store imports the session cleanup, which imports the reminder stores.
  const id = require("@/utils/auth/store").useAuthStore.getState().auth?.user?.id;
  return id != null ? String(id) : "anon";
}

/** Has this person switched reminders off for this dog on this phone? */
export function isDogMuted(petId, userKey = reminderUserKey()) {
  if (petId == null) return false;
  return !!useReminderMuteStore.getState().mutedByUser[userKey]?.includes(String(petId));
}

export default useReminderMuteStore;
