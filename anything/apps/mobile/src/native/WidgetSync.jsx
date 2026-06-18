// ───────────────────────────────────────────────────────────────────────────
// WidgetSync (ticket 2.76, Phase 1) — mounted once near the app root. It gathers
// the REAL data the app already computes (active pet, today's reminders, 2.37
// streak, next vet appointment, in-progress walk/trip), builds the widget
// snapshot, and hands it to the guarded bridge whenever that data changes or the
// app returns to the foreground.
//
// 🟠 STAGED: <WidgetSync/> renders nothing and — crucially — only mounts the
// heavy data hooks when the bridge is actually LIVE (real App Group +
// native module installed). While the Apple account is pending,
// isWidgetBridgeAvailable() is false, so this short-circuits to null BEFORE any
// of those hooks run: ZERO extra queries / polling / network today. When the
// account lands and APP_GROUP_ID is set, the inner component mounts and
// snapshots start flowing — no other JS change required. See
// docs/native-widgets.md.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import { useCurrentPet } from "@/hooks/usePetProfile";
import { usePostingStreak } from "@/hooks/useFeedPosts";
import { useVetAppointmentReminders } from "@/hooks/useVetAppointmentReminders";
import { useTodayReminders } from "@/hooks/useTodayReminders";
import { useWalkSessions } from "@/hooks/useProviders";
import { useTransportTrips } from "@/hooks/useTransport";
import { buildWidgetSnapshot } from "@/utils/widgetSnapshot";
import { isWidgetBridgeAvailable, syncWidgetSnapshot } from "./widgetBridge";

// Soonest still-upcoming scheduled appointment for the active pet.
function pickNextAppointment(appointments, nowMs) {
  if (!Array.isArray(appointments)) return null;
  return appointments
    .filter((a) => a && a.status === "scheduled" && a.appointmentDateTime)
    .filter((a) => new Date(a.appointmentDateTime).getTime() >= nowMs)
    .sort((a, b) => new Date(a.appointmentDateTime) - new Date(b.appointmentDateTime))[0] || null;
}

function WidgetSyncActive() {
  const { data: pet } = useCurrentPet();
  const petId = pet?.id ?? null;

  // Today's actionable reminders (overdue + heads-up), the posting streak, the
  // next appointment, and any in-progress walk/trip — all the app's real data.
  const { overdue, headsUp, now } = useTodayReminders({});
  const { streak } = usePostingStreak(petId);
  const { data: appointments } = useVetAppointmentReminders();
  const { data: walkData } = useWalkSessions(petId, { live: true });
  const { data: trips } = useTransportTrips(petId);

  const snapshot = useMemo(() => {
    const nowMs = now instanceof Date ? now.getTime() : Date.now();
    const reminders = [...(overdue || []), ...(headsUp || [])];
    const activeWalk = (walkData?.sessions || []).find((s) => s?.status === "in_progress") || null;
    const activeTrip = (Array.isArray(trips) ? trips : []).find((t) => t?.status === "in_transit") || null;
    return buildWidgetSnapshot({
      pet,
      reminders,
      // doneCount is a display nicety; wire it to the Today-progress source when
      // the widget is validated on-device (TODO 2.76 follow-up). 0 is safe/real.
      completedCount: 0,
      streakDays: streak || 0,
      nextAppointment: pickNextAppointment(appointments, nowMs),
      activeWalk,
      activeTrip,
      now: now instanceof Date ? now : new Date(),
    });
  }, [pet, overdue, headsUp, streak, appointments, walkData, trips, now]);

  // Write whenever the snapshot content changes (skip identical re-writes).
  const lastJson = useRef(null);
  useEffect(() => {
    const json = JSON.stringify({ ...snapshot, generatedAt: undefined });
    if (json === lastJson.current) return;
    lastJson.current = json;
    syncWidgetSnapshot(snapshot);
  }, [snapshot]);

  // Re-push on foreground so the widget is fresh after the app was backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncWidgetSnapshot(snapshot);
    });
    return () => sub.remove();
  }, [snapshot]);

  return null;
}

export default function WidgetSync() {
  // Stable for the session: the placeholder App Group / missing native module
  // can't change at runtime, so this gate also keeps the heavy hooks unmounted
  // (no extra fetches/polling) until the bridge is real.
  if (!isWidgetBridgeAvailable()) return null;
  return <WidgetSyncActive />;
}
