import { create } from "zustand";
import { mockRoutines } from "@/data/routinesData";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import useRemindersStore from "./remindersStore";

const useRoutinesStore = create((set, get) => ({
  // State
  routines: [],
  initialized: false,
  loading: false,
  error: null,

  // Load routines from database
  loadRoutines: async (petId) => {
    try {
      set({ loading: true, error: null });

      const url = petId ? `/api/routines?petId=${petId}` : "/api/routines";

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to load routines: ${response.statusText}`);
      }

      const data = await response.json();
      const routines = data.routines || [];

      // Transform database routines to app format
      const transformedRoutines = routines.map((routine) => ({
        id: routine.id.toString(),
        petId: routine.pet_id.toString(),
        type: routine.routine_type,
        isActive: routine.is_active,
        title: routine.title,
        description: routine.description,

        // Feeding-specific: feeding_schedule JSON array
        meals: routine.feeding_schedule || [],

        // Walk-specific: walk_schedule JSON array
        walks: routine.walk_schedule || [],

        // Medication-specific
        medicationName: routine.medication_details?.medicationName,
        dose: routine.medication_details?.dose,
        prescribedBy: routine.medication_details?.prescribedBy,
        instructions: routine.medication_details?.instructions,
        startDate: routine.medication_details?.startDate,
        endDate: routine.medication_details?.endDate,

        // Photo check specific - support both new multi-area and legacy single-area
        photoCheckSchedule:
          routine.photo_check_details?.photoCheckSchedule ||
          (routine.photo_check_details?.bodyArea
            ? [
                {
                  bodyArea: routine.photo_check_details.bodyArea,
                  frequency: routine.frequency,
                  preferredDay: routine.preferred_day,
                  preferredTime: routine.times?.[0] || "10:00",
                  reminderEnabled: routine.notification_enabled,
                  timeSensitive: routine.time_sensitive,
                  notes: routine.notes || "",
                },
              ]
            : null),
        bodyArea: routine.photo_check_details?.bodyArea, // Legacy field

        // Medical Care specific - multi-item schedule
        medicalCareItems: routine.medical_care_details?.medicalCareItems || [],

        // Wellness Check specific - multi-item schedule (use camelCase to match RoutineCard expectations)
        wellnessCheckItems: routine.wellness_check_schedule || [],

        // General fields
        frequency: routine.frequency,
        preferredDay: routine.preferred_day,
        times: routine.times || [],
        days: routine.days || [],
        notificationEnabled: routine.notification_enabled,
        timeSensitive: routine.time_sensitive,
        notes: routine.notes,
        createdAt: routine.created_at,
        updatedAt: routine.updated_at,
      }));

      set({ routines: transformedRoutines, loading: false, initialized: true });

      // Generate reminders from active routines
      const remindersStore = useRemindersStore.getState();
      const activeRoutines = transformedRoutines.filter((r) => r.isActive);

      activeRoutines.forEach((routine) => {
        const reminders = generateRemindersFromRoutine(routine);
        reminders.forEach((reminder) => {
          remindersStore.addReminderFromRoutine(reminder);
        });
      });

      return transformedRoutines;
    } catch (error) {
      console.error("[routinesStore] Error loading routines:", error);
      set({ error: error.message, loading: false });
      // Fallback to mock data if API fails
      set({ routines: mockRoutines, initialized: true });
      return mockRoutines;
    }
  },

  // Initialize reminders (call once on app start)
  initializeReminders: () => {
    if (get().initialized) return;

    const activeRoutines = get().routines.filter((r) => r.isActive);
    const remindersStore = useRemindersStore.getState();

    activeRoutines.forEach((routine) => {
      const reminders = generateRemindersFromRoutine(routine);
      reminders.forEach((reminder) => {
        remindersStore.addReminderFromRoutine(reminder);
      });
    });

    set({ initialized: true });
  },

  // Actions
  addRoutine: async (routine) => {
    try {
      set({ loading: true, error: null });

      // Transform app format to database format
      const payload = {
        petId: routine.petId,
        type: routine.type,
        isActive: routine.isActive ?? true,
        title: routine.title,
        description: routine.description,

        // Feeding-specific: send meals as JSON
        feedingSchedule: routine.type === "feeding" ? routine.meals : null,

        // Walk-specific: send walks as JSON
        walkSchedule: routine.type === "walk" ? routine.walks : null,

        // Medication-specific
        medicationDetails:
          routine.type === "medication"
            ? {
                medicationName: routine.medicationName,
                dose: routine.dose,
                prescribedBy: routine.prescribedBy,
                instructions: routine.instructions,
                startDate: routine.startDate,
                endDate: routine.endDate,
              }
            : null,

        // Photo check specific - save multi-area schedule
        photoCheckDetails:
          routine.type === "photo_check"
            ? {
                photoCheckSchedule: routine.photoCheckSchedule,
                bodyArea: routine.bodyArea, // Legacy field for backward compatibility
              }
            : null,

        // Medical Care specific - save full multi-item array
        medicalCareDetails:
          routine.type === "medical_care"
            ? { medicalCareItems: routine.medicalCareItems || [] }
            : null,

        // Wellness Check specific - save wellness check schedule
        wellnessCheckSchedule:
          routine.type === "wellness_check"
            ? routine.wellnessCheckSchedule || []
            : null,

        // General fields
        frequency: routine.frequency,
        preferredDay: routine.preferredDay,
        times: routine.times,
        days: routine.days,
        notificationEnabled: routine.notificationEnabled ?? true,
        timeSensitive: routine.timeSensitive ?? true,
        notes: routine.notes,
      };

      const response = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to create routine: ${response.statusText}`);
      }

      const data = await response.json();
      const newRoutine = data.routine;

      // Transform back to app format
      const transformedRoutine = {
        id: newRoutine.id.toString(),
        petId: newRoutine.pet_id.toString(),
        type: newRoutine.routine_type,
        isActive: newRoutine.is_active,
        title: newRoutine.title,
        description: newRoutine.description,
        meals: newRoutine.feeding_schedule || [],
        walks: newRoutine.walk_schedule || [],
        medicationName: newRoutine.medication_details?.medicationName,
        dose: newRoutine.medication_details?.dose,
        prescribedBy: newRoutine.medication_details?.prescribedBy,
        instructions: newRoutine.medication_details?.instructions,
        startDate: newRoutine.medication_details?.startDate,
        endDate: newRoutine.medication_details?.endDate,
        photoCheckSchedule:
          newRoutine.photo_check_details?.photoCheckSchedule ||
          (newRoutine.photo_check_details?.bodyArea
            ? [
                {
                  bodyArea: newRoutine.photo_check_details.bodyArea,
                  frequency: newRoutine.frequency,
                  preferredDay: newRoutine.preferred_day,
                  preferredTime: newRoutine.times?.[0] || "10:00",
                  reminderEnabled: newRoutine.notification_enabled,
                  timeSensitive: newRoutine.time_sensitive,
                  notes: newRoutine.notes || "",
                },
              ]
            : null),
        bodyArea: newRoutine.photo_check_details?.bodyArea,
        medicalCareItems: newRoutine.medical_care_details?.medicalCareItems || [],
        // Use `wellnessCheckItems` to match the reminder generator and loadRoutines
        // (the old `wellnessCheckSchedule` key meant new wellness routines generated
        // no reminders until reload).
        wellnessCheckItems: newRoutine.wellness_check_schedule || [],
        frequency: newRoutine.frequency,
        preferredDay: newRoutine.preferred_day,
        times: newRoutine.times || [],
        days: newRoutine.days || [],
        notificationEnabled: newRoutine.notification_enabled,
        timeSensitive: newRoutine.time_sensitive,
        notes: newRoutine.notes,
        createdAt: newRoutine.created_at,
        updatedAt: newRoutine.updated_at,
      };

      set((state) => ({
        routines: [...state.routines, transformedRoutine],
        loading: false,
      }));

      // Generate reminders from this routine
      const remindersStore = useRemindersStore.getState();
      const reminders = generateRemindersFromRoutine(transformedRoutine);
      reminders.forEach((reminder) => {
        remindersStore.addReminderFromRoutine(reminder);
      });

      return transformedRoutine;
    } catch (error) {
      console.error("[routinesStore] Error creating routine:", error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  updateRoutine: async (id, updates) => {
    try {
      set({ loading: true, error: null });

      const routine = get().routines.find((r) => r.id === id);
      if (!routine) {
        throw new Error("Routine not found");
      }

      // Transform app format to database format
      const payload = {
        id: parseInt(id),
        petId: updates.petId || routine.petId,
        type: updates.type || routine.type,
        isActive: updates.isActive ?? routine.isActive,
        title: updates.title || routine.title,
        description: updates.description || routine.description,

        // Feeding-specific: send meals as JSON
        feedingSchedule: updates.meals || routine.meals,

        // Walk-specific: send walks as JSON
        walkSchedule: updates.walks || routine.walks,

        // Medication-specific
        medicationDetails:
          updates.type === "medication" || routine.type === "medication"
            ? {
                medicationName:
                  updates.medicationName || routine.medicationName,
                dose: updates.dose || routine.dose,
                prescribedBy: updates.prescribedBy || routine.prescribedBy,
                instructions: updates.instructions || routine.instructions,
                startDate: updates.startDate || routine.startDate,
                endDate: updates.endDate || routine.endDate,
              }
            : null,

        // Photo check specific - save multi-area schedule
        photoCheckDetails:
          updates.type === "photo_check" || routine.type === "photo_check"
            ? {
                photoCheckSchedule:
                  updates.photoCheckSchedule || routine.photoCheckSchedule,
                bodyArea: updates.bodyArea || routine.bodyArea, // Legacy field
              }
            : null,

        // Medical Care specific - send the FULL items array so backend
        // replaces the stored list (no partial overwrites)
        medicalCareDetails:
          updates.type === "medical_care" || routine.type === "medical_care"
            ? {
                medicalCareItems:
                  updates.medicalCareItems !== undefined
                    ? updates.medicalCareItems
                    : routine.medicalCareItems || [],
              }
            : null,

        // Wellness Check specific - send the FULL items array
        wellnessCheckSchedule:
          updates.type === "wellness_check" || routine.type === "wellness_check"
            ? updates.wellnessCheckSchedule !== undefined
              ? updates.wellnessCheckSchedule
              : routine.wellness_check_schedule || []
            : null,

        // General fields
        frequency: updates.frequency || routine.frequency,
        preferredDay: updates.preferredDay ?? routine.preferredDay,
        times: updates.times || routine.times,
        days: updates.days || routine.days,
        notificationEnabled:
          updates.notificationEnabled ?? routine.notificationEnabled,
        timeSensitive: updates.timeSensitive ?? routine.timeSensitive,
        notes: updates.notes !== undefined ? updates.notes : routine.notes,
      };

      const response = await fetch("/api/routines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to update routine: ${response.statusText}`);
      }

      const data = await response.json();
      const updatedRoutine = data.routine;

      // Transform back to app format
      const transformedRoutine = {
        id: updatedRoutine.id.toString(),
        petId: updatedRoutine.pet_id.toString(),
        type: updatedRoutine.routine_type,
        isActive: updatedRoutine.is_active,
        title: updatedRoutine.title,
        description: updatedRoutine.description,
        meals: updatedRoutine.feeding_schedule || [],
        walks: updatedRoutine.walk_schedule || [],
        medicationName: updatedRoutine.medication_details?.medicationName,
        dose: updatedRoutine.medication_details?.dose,
        prescribedBy: updatedRoutine.medication_details?.prescribedBy,
        instructions: updatedRoutine.medication_details?.instructions,
        startDate: updatedRoutine.medication_details?.startDate,
        endDate: updatedRoutine.medication_details?.endDate,
        photoCheckSchedule:
          updatedRoutine.photo_check_details?.photoCheckSchedule ||
          (updatedRoutine.photo_check_details?.bodyArea
            ? [
                {
                  bodyArea: updatedRoutine.photo_check_details.bodyArea,
                  frequency: updatedRoutine.frequency,
                  preferredDay: updatedRoutine.preferred_day,
                  preferredTime: updatedRoutine.times?.[0] || "10:00",
                  reminderEnabled: updatedRoutine.notification_enabled,
                  timeSensitive: updatedRoutine.time_sensitive,
                  notes: updatedRoutine.notes || "",
                },
              ]
            : null),
        bodyArea: updatedRoutine.photo_check_details?.bodyArea,
        medicalCareItems:
          updatedRoutine.medical_care_details?.medicalCareItems || [],
        wellnessCheckItems: updatedRoutine.wellness_check_schedule || [],
        frequency: updatedRoutine.frequency,
        preferredDay: updatedRoutine.preferred_day,
        times: updatedRoutine.times || [],
        days: updatedRoutine.days || [],
        notificationEnabled: updatedRoutine.notification_enabled,
        timeSensitive: updatedRoutine.time_sensitive,
        notes: updatedRoutine.notes,
        createdAt: updatedRoutine.created_at,
        updatedAt: updatedRoutine.updated_at,
      };

      set((state) => ({
        routines: state.routines.map((r) =>
          r.id === id ? transformedRoutine : r,
        ),
        loading: false,
      }));

      // Regenerate future reminders. AWAIT the removal first: it cancels the old
      // (no-lead) OS notifications and clears the upcoming instances in a set()
      // that lives past an `await cancelNotification` loop. Without the await,
      // addReminderFromRoutine's id-based dedup runs against the not-yet-removed
      // state, early-returns on every still-present instance, and the new
      // lead-time is never scheduled — the edit-Early-reminder repro.
      const remindersStore = useRemindersStore.getState();
      await remindersStore.removeFutureRemindersByRoutine(id);

      const reminders = generateRemindersFromRoutine(transformedRoutine);
      for (const reminder of reminders) {
        await remindersStore.addReminderFromRoutine(reminder);
      }

      // Editing rebuilds the occurrences fresh, so a previously-Closed heads-up
      // for an affected (still-future) occurrence must reappear. Photo/wellness
      // instance ids are stamped by DAY, so editing only the TIME keeps the same
      // id and the old `${id}::early` ack would keep suppressing the card while
      // the rescheduled push still fires. Clear those acks for this routine.
      // Awaited AFTER the regenerate (PR #52 ordering lesson); best-effort inside.
      // This also covers toggleRoutineActive re-enable, which routes through here.
      await get().clearEarlyDismissalsByRoutine(transformedRoutine.petId, id);

      return transformedRoutine;
    } catch (error) {
      console.error("[routinesStore] Error updating routine:", error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Best-effort clear of a routine's heads-up acknowledgments (the `${id}::early`
  // rows) for one pet, so regenerated occurrences are not suppressed by stale
  // Closes. A failed clear must NOT block the save — log and move on.
  clearEarlyDismissalsByRoutine: async (petId, routineId) => {
    if (petId == null || routineId == null) return;
    try {
      const response = await fetch(
        `/api/health/reminder-dismissals?petId=${petId}&routineId=${routineId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        console.warn(
          "[routinesStore] Failed to clear early dismissals:",
          response.status,
        );
      }
    } catch (error) {
      console.warn("[routinesStore] Error clearing early dismissals:", error);
    }
  },

  deleteRoutine: async (id) => {
    console.log("[routinesStore] deleteRoutine called", { id });
    try {
      set({ loading: true, error: null });

      console.log("[routinesStore] Sending DELETE request to API");
      const response = await fetch(`/api/routines?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "[routinesStore] API delete failed:",
          response.status,
          errorText,
        );
        throw new Error(`Failed to delete routine: ${response.statusText}`);
      }

      console.log(
        "[routinesStore] API delete successful, removing from local state",
      );

      // Remove from local state
      set((state) => ({
        routines: state.routines.filter((routine) => routine.id !== id),
        loading: false,
      }));

      console.log("[routinesStore] Removing future reminders");
      // Remove future reminders
      const remindersStore = useRemindersStore.getState();
      remindersStore.removeFutureRemindersByRoutine(id);

      // Refetch routines to ensure UI is in sync with backend
      const currentPetId = get().routines[0]?.petId;
      if (currentPetId) {
        console.log(
          "[routinesStore] Refetching routines for pet:",
          currentPetId,
        );
        await get().loadRoutines(currentPetId);
      } else {
        console.log("[routinesStore] No pet ID found for refetch");
      }

      console.log("[routinesStore] deleteRoutine completed successfully");
    } catch (error) {
      console.error("[routinesStore] Error deleting routine:", error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  toggleRoutineActive: async (id) => {
    const routine = get().routines.find((r) => r.id === id);
    if (!routine) return;

    const newIsActive = !routine.isActive;

    try {
      // Optimistically update UI
      set((state) => ({
        routines: state.routines.map((r) =>
          r.id === id ? { ...r, isActive: newIsActive } : r,
        ),
      }));

      // Update in database
      await get().updateRoutine(id, { isActive: newIsActive });

      const remindersStore = useRemindersStore.getState();

      if (newIsActive) {
        // Re-enable: regenerate reminders. Await the removal first for the same
        // ordering reason as updateRoutine — otherwise the dedup runs against
        // not-yet-removed instances and skips rescheduling (incl. lead-time).
        // (The `${id}::early` acks were already cleared by the awaited
        // updateRoutine call above, so the regenerated occurrences surface.)
        await remindersStore.removeFutureRemindersByRoutine(id);
        const updatedRoutine = { ...routine, isActive: true };
        const reminders = generateRemindersFromRoutine(updatedRoutine);
        for (const reminder of reminders) {
          await remindersStore.addReminderFromRoutine(reminder);
        }
      } else {
        // Disable: disable future reminders
        remindersStore.disableFutureRemindersByRoutine(id);
      }
    } catch (error) {
      // Revert on error
      set((state) => ({
        routines: state.routines.map((r) =>
          r.id === id ? { ...r, isActive: !newIsActive } : r,
        ),
      }));
      throw error;
    }
  },

  // Getters
  getActiveRoutines: () => {
    return get().routines.filter((r) => r.isActive);
  },

  getRoutinesByType: (type) => {
    return get().routines.filter((r) => r.type === type);
  },

  getRoutineById: (id) => {
    return get().routines.find((r) => r.id === id);
  },
}));

export default useRoutinesStore;
