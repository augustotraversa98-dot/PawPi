// Forget everything this PHONE holds to remind the person about a dog that is no longer theirs to see (revoked, left,
// expired, deleted): its routines, its reminder instances, its snoozes, its in-app reminder rows and every pending OS
// notification tagged with it. Other dogs are never touched.
//
// Two entry points:
//   purgePetReminders(petIds)       — a loss we saw happen (utils/petAccess.handleAccessLost).
//   purgeUnlistedPetReminders(pets) — after a successful pets read: whatever is still armed for a dog the list no longer
//                                     has (the loss happened while the app was closed).
//
// Never throws on purpose-built paths; the stores and the notification layer are required lazily (import cycles and the
// launch graph).

import { getSessionEpoch } from "@/utils/auth/sessionEpoch";

const idSet = (values) => new Set((values || []).filter((v) => v != null).map(String));

function removeFromStores(petIds) {
  const useRoutinesStore = require("@/store/routinesStore").default;
  const useRemindersStore = require("@/store/remindersStore").default;
  const useSocialPetStore = require("@/store/socialPetStore").default;

  const ofLostPet = (item) => item?.petId != null && petIds.has(String(item.petId));

  const routines = useRoutinesStore.getState().routines ?? [];
  const lostRoutineIds = routines.filter(ofLostPet).map((r) => String(r.id));
  if (lostRoutineIds.length > 0) {
    useRoutinesStore.setState({ routines: routines.filter((r) => !ofLostPet(r)) });
  }

  const { reminders = [], snoozes = {} } = useRemindersStore.getState();
  const reminderIds = new Set(reminders.filter(ofLostPet).map((r) => r.id));
  const isLostId = (id) =>
    reminderIds.has(id) || lostRoutineIds.some((rid) => String(id).startsWith(`reminder_${rid}_`));
  const nextSnoozes = Object.fromEntries(Object.entries(snoozes).filter(([id]) => !isLostId(id)));
  useRemindersStore.setState({
    reminders: reminders.filter((r) => !ofLostPet(r)),
    snoozes: nextSnoozes,
  });

  const rows = useSocialPetStore.getState().notifications ?? [];
  const keptRows = rows.filter((n) => !(ofLostPet(n) || (n?.reminderId != null && isLostId(n.reminderId))));
  if (keptRows.length !== rows.length) {
    useSocialPetStore.setState({
      notifications: keptRows,
      unreadNotificationCount: keptRows.filter((n) => !n.read).length,
    });
  }
  return [...reminderIds];
}

/** Remove these dogs' routines, reminders and pending alarms. Resolves to the number of alarms cancelled. */
export async function purgePetReminders(petIds) {
  const ids = idSet(petIds);
  if (ids.size === 0) return 0;
  let reminderIds = [];
  try {
    // Stores first (synchronous), so nothing can re-arm from them while the OS list is being read.
    reminderIds = removeFromStores(ids);
  } catch (error) {
    console.warn("[petReminderCleanup] stores failed:", error?.message);
  }
  const { cancelSelectedAlarms } = require("@/utils/notifications");
  // reminderIds too: alarms armed by old builds carry no petId, but their reminder id is known from the store.
  const cancelled = await cancelSelectedAlarms({ lostPetIds: ids, resolvedKeys: reminderIds });
  // A snooze may only be known from the alarm it re-armed (after a relaunch the stores are empty).
  try {
    const useRemindersStore = require("@/store/remindersStore").default;
    for (const id of cancelled.reminderIds) useRemindersStore.getState().clearSnooze(id);
  } catch {
    // best effort
  }
  return cancelled.identifiers.length;
}

// An EMPTY list is acted on only when the next read says it again: a one-off empty answer (the server did not resolve the
// caller yet) must not silence every alarm on the phone.
let emptyReads = 0;

export function resetUnlistedPetMemory() {
  emptyReads = 0;
}

/** After a successful pets read: purge whatever this phone still holds for a dog that is not in `pets`. */
export async function purgeUnlistedPetReminders(pets) {
  if (!Array.isArray(pets)) return 0;
  const epoch = getSessionEpoch();
  const listed = idSet(pets.map((p) => p?.id));
  if (listed.size === 0) {
    emptyReads += 1;
    if (emptyReads < 2) return 0;
  } else {
    emptyReads = 0;
  }

  const { getScheduledNotifications } = require("@/utils/notifications");
  const pending = await getScheduledNotifications();
  const useRoutinesStore = require("@/store/routinesStore").default;
  const useRemindersStore = require("@/store/remindersStore").default;
  const known = [
    ...pending.map((n) => n?.content?.data?.petId),
    ...(useRoutinesStore.getState().routines ?? []).map((r) => r.petId),
    ...(useRemindersStore.getState().reminders ?? []).map((r) => r.petId),
  ];
  const unlisted = [...idSet(known)].filter((id) => !listed.has(id));
  if (unlisted.length === 0 || epoch !== getSessionEpoch()) return 0;
  return purgePetReminders(unlisted);
}
