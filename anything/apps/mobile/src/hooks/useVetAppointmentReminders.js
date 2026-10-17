import { useQuery } from "@tanstack/react-query";
import { useCurrentPet } from "./usePetProfile";
import { combineDateAndTime } from "@/utils/calendarFormat";

// Postgres hands back `appointment_date` as a date/ISO string and `appointment_time` as "HH:MM" or
// "HH:MM:SS"; combineDateAndTime reads both shapes in LOCAL time (the old `${date}T${time}:00`
// concatenation made an Invalid Date for "HH:MM:SS" and for ISO dates — F1-02).
export function appointmentToReminder(apt) {
  const aptDate = combineDateAndTime(apt.appointment_date, apt.appointment_time);
  if (Number.isNaN(aptDate.getTime())) return null;

  let triggerDate = new Date(aptDate);
  switch (apt.reminder_timing) {
    case "1_hour_before":
      triggerDate = new Date(aptDate.getTime() - 60 * 60 * 1000);
      break;
    case "1_day_before":
      triggerDate = new Date(aptDate.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "2_days_before":
      triggerDate = new Date(aptDate.getTime() - 2 * 24 * 60 * 60 * 1000);
      break;
    case "1_week_before":
      triggerDate = new Date(aptDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "at_time":
    default:
      triggerDate = aptDate;
      break;
  }

  return {
    id: `vet_apt_${apt.id}`,
    vetAppointmentId: apt.id,
    petId: apt.pet_id,
    ownerUserId: apt.owner_user_id,
    type: "vet_appointment",
    title: apt.title,
    description: apt.clinic || "Veterinary appointment",
    scheduledAt: triggerDate.toISOString(),
    nextTriggerAt: triggerDate.toISOString(),
    appointmentDateTime: aptDate.toISOString(),
    clinic: apt.clinic,
    veterinarian: apt.veterinarian,
    reasonForVisit: apt.reason_for_visit,
    notes: apt.notes,
    status: "upcoming",
    priority: "high",
    timeSensitive: apt.time_sensitive ?? true,
    notificationEnabled: apt.reminder_enabled ?? true,
    primaryAction: "view_appointment",
    completedAt: null,
    snoozedUntil: null,
    // Store full appointment data
    appointmentData: apt,
  };
}

/**
 * Hook to fetch vet appointments and generate reminders
 * Returns reminders compatible with the reminder system
 */
export function useVetAppointmentReminders() {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["vet-appointment-reminders", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return [];

      // Fetch appointments
      const response = await fetch(
        `/api/vet-appointments?petId=${currentPet.id}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch vet appointments");
      }
      const { appointments } = await response.json();

      // Filter out deleted and past completed appointments
      const activeAppointments = appointments.filter(
        (apt) => apt.status === "scheduled" || apt.status === "missed",
      );

      // Convert appointments to reminders. One malformed row must never take down the whole list,
      // so rows whose date/time can't be read are skipped.
      const reminders = activeAppointments.map(appointmentToReminder).filter(Boolean);

      return reminders;
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  });
}
