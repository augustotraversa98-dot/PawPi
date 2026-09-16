import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useFoodLogs } from "@/hooks/useFetchHealthData";
import { usePetSocialProfile } from "@/hooks/usePetSocialProfile";
import { computeActivation } from "@/utils/gettingStarted";
import {
  getNotificationPermissionGranted,
  requestNotificationPermissions,
  ensureDailyReturnReminder,
} from "@/utils/notifications";

// One flat existence read for "≥1 reminder": the pet's routines (the persisted entity behind
// reminders). Empty / no pet → false.
function useHasReminder(petId) {
  return useQuery({
    queryKey: ["routines", "exist", petId],
    enabled: !!petId,
    // (AUDIT A-30) 30 s staleTime so remounting the Feed doesn't re-hit this
    // existence check on every mount.
    staleTime: 30 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/routines?petId=${petId}`);
      if (!res.ok) throw new Error("Failed to load routines");
      const data = await res.json();
      return (data.routines ?? []).length > 0;
    },
  });
}

// Persist that the 100% celebration has played, so it fires once and then the card retires for good.
const CELEBRATED_KEY = "pawpi.gettingStartedCelebrated";

// Composite hook for the "Getting started" activation card (ticket 2.98). Bundles the derived
// signals (pet fields, reminders, food logs, posts, notification permission) into one activation
// object, exposes the notification-enable action, and manages the once-only celebration flag +
// the daily-return reminder scheduling.
export function useGettingStarted() {
  const { t } = useTranslation();
  const { data: pet } = useCurrentPet();
  const petId = pet?.id;

  // Celebration flag — assume "already celebrated" until storage confirms
  // otherwise, so a returning fully-done user never flashes the celebration.
  const [celebrated, setCelebrated] = useState(true);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CELEBRATED_KEY).then((v) => {
      if (active) setCelebrated(v === "1");
    });
    return () => {
      active = false;
    };
  }, []);
  const markCelebrated = useCallback(() => {
    setCelebrated(true);
    AsyncStorage.setItem(CELEBRATED_KEY, "1").catch(() => {});
  }, []);

  // The activation reads run for the ACTIVE pet whenever there is one — NOT gated
  // on `celebrated`. `celebrated` is a global, one-shot flag (set the first time
  // the user completes the checklist), but activation is per-pet: gating the reads
  // on it left every celebrated account with the post/reminder/meal items frozen
  // permanently unticked (their queries were disabled), and made the card unable
  // to detect completeness for a newly-active, not-yet-activated pet. Correctness
  // wins over the old A-30 micro-optimization; useHasReminder still carries a 30s
  // staleTime and usePetSocialProfile keeps its cached data across mounts, so the
  // per-mount cost for an already-retired card is a single lightweight refetch.
  const activationPetId = petId;

  const { data: foodLogs } = useFoodLogs();
  const { data: profile } = usePetSocialProfile(activationPetId);
  const { data: hasReminder } = useHasReminder(activationPetId);

  const hasMeal = (foodLogs?.logs?.length ?? 0) > 0;
  const hasPost = (profile?.stats?.totalPosts ?? 0) > 0;

  // OS notification permission — read on mount and whenever the app returns to the foreground (the
  // user may grant it in Settings). Real permission state only, never a stored guess.
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const refreshPermission = useCallback(async () => {
    setNotificationsGranted(await getNotificationPermissionGranted());
  }, []);
  useEffect(() => {
    refreshPermission();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const activation = computeActivation({
    pet,
    hasReminder: !!hasReminder,
    hasMeal,
    hasPost,
    notificationsGranted,
  });

  // Daily-return habit: once permission is granted, schedule the recurring daily reminder. The util
  // is idempotent (persisted id), so this effect firing on every render / name change never
  // double-schedules.
  useEffect(() => {
    if (!notificationsGranted) return;
    ensureDailyReturnReminder(
      t("gettingStarted.dailyReminderBody", {
        petName: pet?.name || t("gettingStarted.yourPet"),
      }),
    );
  }, [notificationsGranted, pet?.name, t]);

  const enableNotifications = useCallback(async () => {
    const granted = await requestNotificationPermissions();
    setNotificationsGranted(granted); // the effect above then schedules the daily reminder
    return granted;
  }, []);

  return {
    pet,
    activation,
    notificationsGranted,
    enableNotifications,
    celebrated,
    markCelebrated,
  };
}
