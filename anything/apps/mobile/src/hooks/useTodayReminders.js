import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentPet } from "./usePetProfile";
import { useVetAppointmentReminders } from "./useVetAppointmentReminders";
import useRoutinesStore from "@/store/routinesStore";
import {
  buildResolutionIndex,
  buildOverdueReminders,
  instanceKey,
} from "@/utils/reminderResolution";
import { toDateStr } from "@/utils/wellnessLog";

// Lookback for past-due ("Overdue") enumeration. Instances older than this age out
// of Overdue silently. Configurable here; the resolver bounds the DB fetch to match.
export const OVERDUE_LOOKBACK_DAYS = 30;

// Fetch a pet-scoped list from an API route, returning [] when no pet / on the
// guard. Mirrors the project's React Query convention (see useVetAppointmentReminders).
function usePetList(name, url, pick, petId) {
  return useQuery({
    queryKey: [name, petId],
    queryFn: async () => {
      if (!petId) return [];
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${name}`);
      const data = await res.json();
      return pick(data) ?? [];
    },
    enabled: !!petId,
    staleTime: 1000 * 60,
  });
}

/**
 * Today's reconciled Overdue list for the current pet.
 *
 * Derived DETERMINISTICALLY from the active pet's routines (past-due instances via
 * generateOverdueInstances) plus the DB-backed vet reminders, minus (resolved ∪
 * dismissed) — NOT from the mutable reminders store, so unrelated store activity can
 * never drop a missed item. A per-minute `now` tick drives recomputation so the list
 * tracks the clock rather than piggybacking on query refetches.
 *
 * Returns { overdue, dismiss, isLoading }. `dismiss(reminder)` durably records a skip.
 */
export function useTodayReminders({ now } = {}) {
  const queryClient = useQueryClient();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id ?? null;
  const activePetId = petId != null ? String(petId) : null;

  const routines = useRoutinesStore((s) => s.routines);
  const { data: vetReminders = [] } = useVetAppointmentReminders();

  // Per-minute clock tick so Overdue updates on the clock (a missed instance appears
  // within ~1 min and stays), instead of only when a query refetch / store change
  // happens to fire. Tests inject a fixed `now` to pin it.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (now != null) return; // caller pins the clock
    const id = setInterval(() => setTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, [now]);
  const nowMs = now != null ? new Date(now).getTime() : tick;

  const dismissalsQuery = usePetList(
    "reminder-dismissals",
    `/api/health/reminder-dismissals?petId=${petId}`,
    (d) => d.dismissals,
    petId,
  );
  const wellnessQuery = usePetList(
    "wellness-logs",
    `/api/health/wellness-logs?petId=${petId}&limit=200`,
    (d) => d.logs,
    petId,
  );
  const weightQuery = usePetList(
    "weight-logs",
    `/api/health/weight-logs?petId=${petId}&limit=50`,
    (d) => d.logs,
    petId,
  );
  const medicalQuery = usePetList(
    "medical-care-logs",
    `/api/health/medical-care-logs?petId=${petId}&limit=200`,
    (d) => d.logs,
    petId,
  );
  const photoQuery = usePetList(
    "photo-checks",
    `/api/health/photo-checks?petId=${petId}&limit=100`,
    (d) => d.photoChecks,
    petId,
  );

  const dismissalsKey = ["reminder-dismissals", petId];

  const overdue = useMemo(() => {
    if (!activePetId) return [];

    const index = buildResolutionIndex({
      wellnessLogs: wellnessQuery.data || [],
      weightLogs: weightQuery.data || [],
      medicalLogs: medicalQuery.data || [],
      photoChecks: photoQuery.data || [],
    });

    const dismissedKeys = new Set(
      (dismissalsQuery.data || []).map((d) => d.instance_key),
    );

    return buildOverdueReminders({
      routines,
      vetReminders,
      index,
      dismissedKeys,
      now: new Date(nowMs),
      lookbackDays: OVERDUE_LOOKBACK_DAYS,
      petId,
    });
  }, [
    activePetId,
    petId,
    nowMs,
    routines,
    vetReminders,
    wellnessQuery.data,
    weightQuery.data,
    medicalQuery.data,
    photoQuery.data,
    dismissalsQuery.data,
  ]);

  const dismiss = async (reminder) => {
    const key = instanceKey(reminder);
    if (!petId || !key) return;

    // Optimistic: hide immediately by appending to the dismissals cache.
    queryClient.setQueryData(dismissalsKey, (old = []) =>
      old.some((d) => d.instance_key === key)
        ? old
        : [...old, { instance_key: key }],
    );

    try {
      const res = await fetch("/api/health/reminder-dismissals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId,
          routineId: reminder.routineId ?? null,
          reminderType: reminder.type,
          instanceKey: key,
          scheduledDate: toDateStr(reminder.scheduledAt ?? reminder.nextTriggerAt),
        }),
      });
      if (!res.ok) throw new Error(`Dismiss failed: ${res.statusText}`);
    } catch (err) {
      // Roll back the optimistic hide on failure.
      queryClient.setQueryData(dismissalsKey, (old = []) =>
        old.filter((d) => d.instance_key !== key),
      );
      throw err;
    } finally {
      queryClient.invalidateQueries({ queryKey: dismissalsKey });
    }
  };

  const isLoading =
    dismissalsQuery.isLoading ||
    wellnessQuery.isLoading ||
    weightQuery.isLoading ||
    medicalQuery.isLoading ||
    photoQuery.isLoading;

  return { overdue, dismiss, isLoading };
}
