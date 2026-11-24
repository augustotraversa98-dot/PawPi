// ITEM 3 — upload a daily moment, delete it: the Care Ring must revert (Moment segment reopens,
// ring_closed false) WITHOUT a manual reload. useDeletePost invalidates the ["care-ring"] prefix, and
// useCareRing's day-scoped key matches that prefix, so a mounted ring refetches and picks up the server's
// fresh derivation (posts is a HARD delete, so the server count drops the instant the row is gone).
// fetch is a tiny in-memory "server": posts exist -> moment_done true; DELETE removes it.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCareRing } from "./useCareRing";
import { useCreatePost, useDeletePost } from "./useFeedPosts";

jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 27 } }) }));

const PET = 27;

function makeServer() {
  const server = { posts: [], ringFetches: 0 };
  global.fetch = jest.fn(async (url, opts = {}) => {
    const method = opts.method || "GET";
    if (String(url).startsWith(`/api/pets/${PET}/care-ring`)) {
      server.ringFetches += 1;
      const moment = server.posts.length > 0;
      return {
        ok: true,
        json: async () => ({
          walk_done: true,
          care_done: true,
          moment_done: moment,
          ring_closed: moment,
          rest_day: false,
          paused: false,
        }),
      };
    }
    if (method === "POST" && String(url).startsWith("/api/posts")) {
      const post = { id: 501, pet_id: PET };
      server.posts.push(post);
      return { ok: true, json: async () => ({ post }) };
    }
    if (method === "DELETE" && String(url).startsWith("/api/posts/")) {
      server.posts = [];
      return { ok: true, json: async () => ({ success: true }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  return server;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

test("ring closes when the moment is posted and REVERTS to 2/3 when it is deleted", async () => {
  const server = makeServer();
  const { wrapper } = setup();
  const ring = renderHook(() => useCareRing(PET), { wrapper });
  const create = renderHook(() => useCreatePost(), { wrapper });
  const del = renderHook(() => useDeletePost(), { wrapper });

  await waitFor(() => expect(ring.result.current.data?.moment_done).toBe(false));

  await act(async () => {
    await create.result.current.mutateAsync({ pet_id: PET, is_daily_update: true });
  });
  await waitFor(() => expect(ring.result.current.data?.moment_done).toBe(true));
  expect(ring.result.current.data.ring_closed).toBe(true);

  const before = server.ringFetches;
  await act(async () => {
    await del.result.current.mutateAsync(501);
  });
  await waitFor(() => expect(ring.result.current.data?.moment_done).toBe(false));
  expect(ring.result.current.data.ring_closed).toBe(false);
  expect(server.ringFetches).toBeGreaterThan(before); // it really refetched, not a stale cache hit
});
