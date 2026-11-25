// Keeps this phone's reminder alarms in step with the household without the person having to open the Health tab.
// Mounted once in the signed-in pet shell (components/Pets/ReminderReconciler in the tab layout).
//
//   • pet select (and the first mount): re-read the selected dog's routines;
//   • every other dog (own or shared, e.g. an invite just accepted): read once per launch, so all dogs compete for the
//     alarm budget (utils/alarmBudget: only the soonest ~48 reminders are armed);
//   • app back in the foreground: re-read every dog, then top the alarms up (also offline: fired alarms free slots).
//
// Local alarms only. No server push is involved (one channel per person per task, docs/pr5b-reminder-sync-design.md).

import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useCurrentPet, usePetProfile } from "./usePetProfile";
import useRoutinesStore from "@/store/routinesStore";
import useRemindersStore from "@/store/remindersStore";

// Quick app switches in a row must not each re-read the routines.
export const FOREGROUND_MIN_GAP_MS = 15 * 1000;

const refreshShownDog = (petId) =>
  useRoutinesStore.getState().loadRoutines(petId, { silent: true, coalesce: true });

const refreshOtherDog = (petId) =>
  useRoutinesStore.getState().loadRoutines(petId, { background: true, coalesce: true });

export function useReminderReconcile() {
  const { data: pets } = usePetProfile();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id ?? null;
  const latest = useRef({ petId, pets });
  latest.current = { petId, pets };

  // Pet select (and first mount).
  useEffect(() => {
    if (petId != null) refreshShownDog(petId);
  }, [petId]);

  // Every other dog, once per launch (a newly shared one the moment it appears).
  const seen = useRef(new Set());
  useEffect(() => {
    if (!pets) return;
    const listed = new Set(pets.map((p) => p.id));
    // A dog that left the list (access lost) is "new" again if it comes back.
    for (const id of seen.current) if (!listed.has(id)) seen.current.delete(id);
    for (const pet of pets) {
      if (seen.current.has(pet.id)) continue;
      seen.current.add(pet.id);
      if (pet.id === petId) continue; // the selected dog is loaded by the effect above
      Promise.resolve(refreshOtherDog(pet.id)).then((routines) => {
        if (routines === null) seen.current.delete(pet.id); // failed (offline): try again next time
      });
    }
  }, [pets, petId]);

  // Back in the foreground. Only after a real trip to the background: pulling down the notification centre only makes
  // the app "inactive".
  const wasInBackground = useRef(false);
  const lastRun = useRef(0);
  const onAppState = useCallback((state) => {
    if (state === "background") {
      wasInBackground.current = true;
      return;
    }
    if (state !== "active" || !wasInBackground.current) return;
    wasInBackground.current = false;
    if (Date.now() - lastRun.current < FOREGROUND_MIN_GAP_MS) return;
    lastRun.current = Date.now();
    const { petId: shown, pets: all } = latest.current;
    const reads = (all ?? []).filter((p) => p.id !== shown).map((p) => refreshOtherDog(p.id));
    if (shown != null) reads.push(refreshShownDog(shown));
    // Even when every read fails (offline), alarms that fired have freed slots for the next ones.
    Promise.allSettled(reads).then(() => useRemindersStore.getState().syncAlarms());
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppState);
    return () => subscription?.remove?.();
  }, [onAppState]);
}

export default useReminderReconcile;
