import { create } from "zustand";
import { mockRoutines } from "@/data/routinesData";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import useRemindersStore from "./remindersStore";

// Normalize a routine's schedule field (feeding/walk/wellness/medical items) to a
// real array. The backend stores these as jsonb and they can re-enter the app as
// a stringified JSON array rather than a parsed array; `value || []` does NOT
// coerce a non-empty string, which is what crashes the reminder generators
// (`x.forEach is not a function`). Parse a JSON string back to an array; anything
// that isn't an array (or doesn't parse to one) becomes [].
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

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

        // Feeding-specific: parse feeding_schedule JSON
        meals: toArray(routine.feeding_schedule),

        // Walk-specific: parse walk_schedule JSON
        walks: toArray(routine.walk_schedule),

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
        medicalCareItems: toArray(routine.medical_care_details?.medicalCareItems),

        // Wellness Check specific - multi-item schedule (use camelCase to match RoutineCard expectations)
        wellnessCheckItems: toArray(routine.wellness_check_schedule),

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
        meals: toArray(newRoutine.feeding_schedule),
        walks: toArray(newRoutine.walk_schedule),
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
        medicalCareItems: toArray(newRoutine.medical_care_details?.medicalCareItems),
        // Use `wellnessCheckItems` to match the reminder generator and loadRoutines
        // (the old `wellnessCheckSchedule` key meant new wellness routines generated
        // no reminders until reload).
        wellnessCheckItems: toArray(newRoutine.wellness_check_schedule),
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
        meals: toArray(updatedRoutine.feeding_schedule),
        walks: toArray(updatedRoutine.walk_schedule),
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
        medicalCareItems: toArray(
          updatedRoutine.medical_care_details?.medicalCareItems,
        ),
        wellnessCheckItems: toArray(updatedRoutine.wellness_check_schedule),
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

      // Regenerate future reminders
      const remindersStore = useRemindersStore.getState();
      remindersStore.removeFutureRemindersByRoutine(id);

      const reminders = generateRemindersFromRoutine(transformedRoutine);
      reminders.forEach((reminder) => {
        remindersStore.addReminderFromRoutine(reminder);
      });

      return transformedRoutine;
    } catch (error) {
      console.error("[routinesStore] Error updating routine:", error);
      set({ error: error.message, loading: false });
      throw error;
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
        // Re-enable: regenerate reminders
        remindersStore.removeFutureRemindersByRoutine(id);
        const updatedRoutine = { ...routine, isActive: true };
        const reminders = generateRemindersFromRoutine(updatedRoutine);
        reminders.forEach((reminder) => {
          remindersStore.addReminderFromRoutine(reminder);
        });
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
