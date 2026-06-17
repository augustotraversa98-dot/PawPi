// Contract for the owner-side chat hooks (Phase 2 ticket 2.5):
//   - useMyThreads keys on ["threads","owner"], hits /api/threads?side=owner,
//     returns threads[], throws on !ok;
//   - useThreadMessages is disabled with no id, else hits the messages route,
//     returns messages[];
//   - useStartThread POSTs to /api/threads with { providerId } and returns { thread };
//   - useSendMessage POSTs to /api/threads/[id]/messages with the body;
//   - useUnreadCount hits the unread-count route and returns the number.
// fetch is mocked; no network, no DB. The participant RLS is proven in the harness.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useMyThreads,
  useThreadMessages,
  useStartThread,
  useSendMessage,
  useUnreadCount,
} from "./useProviders";

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function lastFetchUrl() {
  const calls = global.fetch.mock.calls;
  return calls[calls.length - 1][0];
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useMyThreads", () => {
  test("fetches the owner inbox and returns the array", async () => {
    const threads = [{ id: 1, provider_name: "Happy Paws", unread_count: 2 }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ threads }) }));

    const { result } = renderHook(() => useMyThreads(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/threads?side=owner");
    expect(result.current.data).toBe(threads);
  });
});

describe("useThreadMessages", () => {
  test("is disabled when no thread id is given", () => {
    global.fetch = jest.fn();
    const { result } = renderHook(() => useThreadMessages(null), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("fetches messages for a thread id", async () => {
    const messages = [{ id: 9, body: "hi" }];
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ messages }) }));
    const { result } = renderHook(() => useThreadMessages(100), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/threads/100/messages?limit=50");
    expect(result.current.data).toBe(messages);
  });
});

describe("useStartThread", () => {
  test("POSTs to /api/threads and returns the thread", async () => {
    const thread = { id: 5, owner_user_id: 7, provider_id: 10 };
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ thread, reused: false }),
    }));
    const { result } = renderHook(() => useStartThread(), {
      wrapper: makeWrapper(makeClient()),
    });
    let res;
    await act(async () => {
      res = await result.current.mutateAsync({ providerId: 10 });
    });
    expect(lastFetchUrl()).toBe("/api/threads");
    expect(res.thread).toEqual(thread);
  });

  test("surfaces the backend error message", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Provider not found" }),
    }));
    const { result } = renderHook(() => useStartThread(), {
      wrapper: makeWrapper(makeClient()),
    });
    await expect(
      act(async () => {
        await result.current.mutateAsync({ providerId: 999 });
      }),
    ).rejects.toThrow("Provider not found");
  });
});

describe("useSendMessage", () => {
  test("POSTs the body to the thread's messages route", async () => {
    const message = { id: 1, body: "hi" };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ message }) }));
    const { result } = renderHook(() => useSendMessage(100), {
      wrapper: makeWrapper(makeClient()),
    });
    let res;
    await act(async () => {
      res = await result.current.mutateAsync({ body: "hi" });
    });
    expect(lastFetchUrl()).toBe("/api/threads/100/messages");
    expect(res.message).toEqual(message);
  });
});

describe("useUnreadCount", () => {
  test("returns the unread count for the owner side", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ unread_count: 4 }),
    }));
    const { result } = renderHook(() => useUnreadCount(), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetchUrl()).toBe("/api/threads/unread-count?side=owner");
    expect(result.current.data).toBe(4);
  });
});
