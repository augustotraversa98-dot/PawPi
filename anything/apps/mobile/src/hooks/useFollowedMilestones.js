// useFollowedMilestones — the followed-pets milestone events for the feed (unit E3).
// Returns pets the viewer's active pet follows whose birthday/gotcha day is TODAY (real dates only),
// so the feed can show a celebratory event card. Empty by default — never a fabricated milestone.

import { useQuery } from "@tanstack/react-query";
import { getLocalPostDateString } from "@/utils/dateUtils";

export function followedMilestonesKey(viewerPetId, day) {
  return ["followed-milestones", viewerPetId, day];
}

export function useFollowedMilestones(viewerPetId) {
  const day = getLocalPostDateString();
  return useQuery({
    queryKey: followedMilestonesKey(viewerPetId, day),
    enabled: !!viewerPetId,
    staleTime: 5 * 60 * 1000, // milestones only change at the day boundary
    queryFn: async () => {
      const res = await fetch(`/api/feed/milestones?viewerPetId=${viewerPetId}&day=${day}`);
      if (!res.ok) return { milestones: [] }; // degrade quietly — never break the feed
      return res.json();
    },
  });
}
