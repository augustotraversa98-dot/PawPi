import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Dog Social Profile data. GET /api/pets/[id]/profile returns the pet identity,
// owner, aggregate stats, isFollowing (only when viewerPetId is supplied) and
// the pet's posts for the daily-moments grid. Keyed on petId so useToggleFollow
// can optimistically patch the same cache entry.
export function usePetSocialProfile(petId, viewerPetId) {
  return useQuery({
    queryKey: ["petProfile", petId],
    queryFn: async () => {
      const qs = viewerPetId ? `?viewerPetId=${viewerPetId}` : "";
      const response = await fetch(`/api/pets/${petId}/profile${qs}`);
      if (!response.ok) {
        throw new Error("Failed to fetch pet profile");
      }
      return response.json();
    },
    enabled: !!petId,
    staleTime: 0, // always reflect new follows/posts
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

// Follow / unfollow the profile pet. Mirrors useTogglePaw's optimistic pattern:
// flip isFollowing and bump stats.followers on the ["petProfile", petId] cache
// immediately, roll back on error, and invalidate on settle so the server count
// wins. Pass the viewer's active pet as followerPetId.
export function useToggleFollow(petId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ isFollowing, viewerPetId }) => {
      const method = isFollowing ? "DELETE" : "POST";
      const response = await fetch(`/api/pets/${petId}/follow`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerPetId: viewerPetId }),
      });

      if (!response.ok) {
        throw new Error("Failed to toggle follow");
      }

      return response.json();
    },
    onMutate: async ({ isFollowing }) => {
      await queryClient.cancelQueries({ queryKey: ["petProfile", petId] });

      const previous = queryClient.getQueryData(["petProfile", petId]);

      queryClient.setQueryData(["petProfile", petId], (old) => {
        if (!old) return old;
        const delta = isFollowing ? -1 : 1;
        return {
          ...old,
          isFollowing: !isFollowing,
          stats: {
            ...old.stats,
            followers: Math.max(0, (old.stats?.followers ?? 0) + delta),
          },
        };
      });

      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["petProfile", petId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["petProfile", petId] });
    },
  });
}
