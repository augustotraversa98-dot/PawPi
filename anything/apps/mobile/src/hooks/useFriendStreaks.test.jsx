// useFriendStreaks — one request for all the dogs on a screen; the server decides who qualifies.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { friendStreakIds, toStreakMap, useFriendStreaks } from "./useFriendStreaks";

const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

function setup(ids) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook((props) => useFriendStreaks(props), { wrapper, initialProps: ids }) };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

test("ids are unique, positive and sorted", () => {
  expect(friendStreakIds([9, "3", 9, null, 0, -1, "x"])).toEqual([3, 9]);
  expect(friendStreakIds(undefined)).toEqual([]);
});

test("only a streak of 7 or more becomes a flame", () => {
  expect(toStreakMap({ streaks: [{ pet_id: 1, streak: 6 }, { pet_id: 2, streak: 7 }] })).toEqual({ 2: 7 });
  expect(toStreakMap({ available: false, streaks: [] })).toEqual({});
  expect(toStreakMap(null)).toEqual({});
});

test("asks ONCE for the whole list", async () => {
  global.fetch.mockResolvedValue(reply({ available: true, streaks: [{ pet_id: 3, streak: 11 }] }));
  const { result } = setup([9, 3, 9]);
  await waitFor(() => expect(result.current.streaks).toEqual({ 3: 11 }));
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith("/api/posts/friend-streaks?petIds=3,9");
});

test("asks nothing when there is no dog to ask about, also on pull-to-refresh", async () => {
  const { result } = setup([]);
  await result.current.refetch();
  expect(result.current.streaks).toEqual({});
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([404, 405])("an older server (%i) means no flames", async (status) => {
  global.fetch.mockResolvedValue(reply({ error: "Not found" }, status));
  const { result, client } = setup([3]);
  await waitFor(() => expect(client.getQueryState(["friend-streaks", "3"]).status).toBe("success"));
  expect(result.current.streaks).toEqual({});
});

test("a server without the database change means no flames", async () => {
  global.fetch.mockResolvedValue(reply({ available: false, streaks: [] }));
  const { result, client } = setup([3]);
  await waitFor(() => expect(client.getQueryState(["friend-streaks", "3"]).status).toBe("success"));
  expect(result.current.streaks).toEqual({});
});

test("a server error means no flames, never a throw", async () => {
  global.fetch.mockResolvedValue(reply({ error: "boom" }, 500));
  const { result, client } = setup([3]);
  await waitFor(() => expect(client.getQueryState(["friend-streaks", "3"]).status).toBe("error"));
  expect(result.current.streaks).toEqual({});
});

test("never returns a dog that is no longer asked about", async () => {
  global.fetch.mockResolvedValue(reply({ streaks: [{ pet_id: 3, streak: 11 }] }));
  const { result, rerender } = setup([3]);
  await waitFor(() => expect(result.current.streaks).toEqual({ 3: 11 }));
  global.fetch.mockReturnValue(new Promise(() => {}));
  rerender([4]);
  expect(result.current.streaks).toEqual({});
});
