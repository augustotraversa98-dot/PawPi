import { useQuery } from "@tanstack/react-query";
import useRoutinesStore from "@/store/routinesStore";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { buildTodayProgress } from "@/utils/todayProgress";
import { getLocalPostDateString } from "@/utils/dateUtils";

// Today's Progress on REAL data (ticket 2.66): the active pet's logs for the
// local day, summarized against the day's routine targets. Pet-scoped via the
// owner+pet-scoped health-log GET routes (reuses existing RLS).
function usePetLogs(name, petId) {
  return useQuery({
    queryKey: [name, petId],
    queryFn: async () => {
      if (!petId) return [];
      const res = await fetch(`/api/health/${name}?petId=${petId}&limit=200`);
      if (!res.ok) throw new Error(`Failed to fetch ${name}`);
      const data = await res.json();
      return data.logs ?? [];
    },
    enabled: !!petId,
    staleTime: 1000 * 60,
  });
}

export function useTodayProgress() {
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id ?? null;
  const allRoutines = useRoutinesStore((s) => s.routines);

  const { data: foodLogs = [] } = usePetLogs("food-logs", petId);
  const { data: walkLogs = [] } = usePetLogs("walk-logs", petId);
  const { data: medicalLogs = [] } = usePetLogs("medical-care-logs", petId);

  return buildTodayProgress({
    routines: (allRoutines || []).filter(
      (r) => String(r.petId) === String(petId),
    ),
    foodLogs,
    walkLogs,
    medicalLogs,
    todayStr: getLocalPostDateString(),
  });
}
