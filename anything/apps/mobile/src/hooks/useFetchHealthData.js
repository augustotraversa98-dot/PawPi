import { useQuery } from "@tanstack/react-query";
import { useCurrentPet } from "./usePetProfile";

// Fetch food logs
export function useFoodLogs(limit = 10) {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["health", "food-logs", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { logs: [] };

      const response = await fetch(
        `/api/health/food-logs?petId=${currentPet.id}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch food logs");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30, // 30 seconds
  });
}

// Fetch poo logs
export function usePooLogs(limit = 10) {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["health", "poo-logs", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { logs: [] };

      const response = await fetch(
        `/api/health/poo-logs?petId=${currentPet.id}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch poo logs");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30,
  });
}

// Fetch walk logs
export function useWalkLogs(limit = 10) {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["health", "walk-logs", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { logs: [] };

      const response = await fetch(
        `/api/health/walk-logs?petId=${currentPet.id}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch walk logs");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30,
  });
}

// Fetch general checks
export function useGeneralChecks(limit = 10) {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["health", "general-checks", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { checks: [] };

      const response = await fetch(
        `/api/health/general-checks?petId=${currentPet.id}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch general checks");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30,
  });
}

// Fetch photo checks
export function usePhotoChecks(limit = 20) {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["health", "photo-checks", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { photoChecks: [] };

      const response = await fetch(
        `/api/health/photo-checks?petId=${currentPet.id}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch photo checks");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30,
  });
}

// Fetch timeline for today
export function useHealthTimeline() {
  const { data: currentPet } = useCurrentPet();
  const today = new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["health", "timeline", currentPet?.id, today],
    queryFn: async () => {
      if (!currentPet?.id) return { timeline: [] };

      const response = await fetch(
        `/api/health/timeline?petId=${currentPet.id}&date=${today}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch health timeline");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30,
  });
}

// Fetch pee logs
export function usePoeLogs(limit = 10) {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["health", "pee-logs", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { logs: [] };

      const response = await fetch(
        `/api/health/pee-logs?petId=${currentPet.id}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch pee logs");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30,
  });
}

// Fetch vomit logs
export function useVomitLogs(limit = 10) {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["health", "vomit-logs", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { logs: [] };

      const response = await fetch(
        `/api/health/vomit-logs?petId=${currentPet.id}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch vomit logs");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30,
  });
}

// Fetch weight logs
export function useWeightLogs(limit = 20) {
  const { data: currentPet } = useCurrentPet();

  return useQuery({
    queryKey: ["health", "weight-logs", currentPet?.id],
    queryFn: async () => {
      if (!currentPet?.id) return { logs: [] };

      const response = await fetch(
        `/api/health/weight-logs?petId=${currentPet.id}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch weight logs");
      }
      return response.json();
    },
    enabled: !!currentPet?.id,
    staleTime: 1000 * 30,
  });
}
