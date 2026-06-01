import { useQuery } from "@tanstack/react-query";
import { useCurrentPet } from "./useCurrentPet";

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

      // Convert appointments to reminders
      const reminders = activeAppointments.map((apt) => {
        // Combine date and time into ISO string
        const appointmentDateTime = `${apt.appointment_date}T${apt.appointment_time}:00`;
        const aptDate = new Date(appointmentDateTime);

        // Calculate trigger time based on reminder_timing
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
      });

      return reminders;
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  });
}
