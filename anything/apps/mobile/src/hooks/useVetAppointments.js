import { useQuery } from "@tanstack/react-query";
import { useCurrentPet } from "./usePetProfile";

/**
 * Raw vet appointment rows for the current pet (every status, incl. completed).
 * useVetAppointmentReminders filters to scheduled/missed before mapping — fine
 * for reminder cards, but Today's Progress needs the completed ones too to
 * count done/total. Same endpoint, pet-scoped, no new route.
 *
 * The query key AND cached shape ({ appointments }) match the existing
 * ["vet-appointments", petId] queries (HealthVetRecord,
 * VetAppointmentRoutineModal) — one shared cache entry, and the
 * ["vet-appointments"] invalidations fired when an appointment is
 * completed/edited refresh this too.
 */
export function useVetAppointments() {
  const { data: currentPet } = useCurrentPet();

  const query = useQuery({
    queryKey: ["vet-appointments", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { appointments: [] };
      const res = await fetch(`/api/vet-appointments?petId=${currentPet.id}`);
      if (!res.ok) throw new Error("Failed to fetch vet appointments");
      return res.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 60,
  });

  return { ...query, appointments: query.data?.appointments ?? [] };
}
