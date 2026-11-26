// useFriendStreaks — the current streak of the FRIEND dogs on a screen (feed posts, a dog's profile).
//
// One request for the whole list (GET /api/posts/friend-streaks), never one per post. The SERVER decides
// who is a friend, respects blocks and only returns a live streak of 7 or more; the app just shows what
// comes back. A server without the feature (or an older one without the route) means "no flames".

import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export const FRIEND_STREAK_MIN = 7;
const MAX_PET_IDS = 100; // the endpoint's own cap

export const friendStreaksKey = ["friend-streaks"];

/** Unique positive pet ids, sorted, so the same set of dogs is always the same request. */
export function friendStreakIds(petIds) {
  const ids = new Set();
  for (const raw of Array.isArray(petIds) ? petIds : []) {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b).slice(0, MAX_PET_IDS);
}

/** The endpoint's answer → { [petId]: streak }. Anything unexpected is no flame. */
export function toStreakMap(data) {
  const map = {};
  for (const row of Array.isArray(data?.streaks) ? data.streaks : []) {
    const streak = Number(row?.streak);
    if (row?.pet_id != null && streak >= FRIEND_STREAK_MIN) map[row.pet_id] = streak;
  }
  return map;
}

/**
 * @param {Array<number|string>} petIds - dogs on screen that are not the viewer's household.
 * @returns {{streaks: Object<string, number>, refetch: () => Promise<unknown>}} only qualifying dogs.
 */
export function useFriendStreaks(petIds) {
  const idList = friendStreakIds(petIds).join(",");

  const query = useQuery({
    queryKey: [...friendStreaksKey, idList],
    enabled: idList !== "",
    // A streak moves at most once a day; follow changes invalidate this key.
    staleTime: 60 * 1000,
    // Keep the flames on screen while a changed list (a new post in the feed) is being asked about.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await fetch(`/api/posts/friend-streaks?petIds=${idList}`);
      // 4xx: a server without this route. Nothing to show, nothing to retry.
      if (response.status >= 400 && response.status < 500) return {};
      if (!response.ok) throw new Error("Failed to load friend streaks");
      return toStreakMap(await response.json());
    },
  });

  // Only the dogs asked about NOW (previous data can hold others).
  const streaks = useMemo(() => {
    const out = {};
    for (const id of idList ? idList.split(",") : []) {
      if (query.data?.[id]) out[id] = query.data[id];
    }
    return out;
  }, [query.data, idList]);

  const { refetch: refetchQuery } = query;
  const refetch = useCallback(
    () => (idList ? refetchQuery() : Promise.resolve()),
    [idList, refetchQuery],
  );

  return { streaks, refetch };
}
