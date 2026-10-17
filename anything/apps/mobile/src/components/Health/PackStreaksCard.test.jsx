// "Streak with a friend" (night run #2, PR C): the free-text @handle field is replaced by a
// typeahead of FRIENDS. Covers search-as-you-type, selection, the "can't submit free text" hint,
// both empty states, disabled rows for existing packs, and the server's friendly rejections.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockPush = jest.fn();
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => require("react").createElement(View, props) };
});

import { PackStreaksCard } from "./PackStreaksCard";

const BELLA = { id: 2, name: "Bella", handle: "bella.paws", avatar_url: null, owner_name: "Beatriz Gomez", pack_status: "none" };
const ECHO = { id: 5, name: "Echo", handle: "echo", avatar_url: null, owner_name: null, pack_status: "pending" };

const originalFetch = global.fetch;
let friendsResponse;
let postResponse;

function installFetch() {
  global.fetch = jest.fn((url, opts) => {
    const u = String(url);
    if (opts?.method === "POST") return Promise.resolve(postResponse);
    if (u.includes("/pack-friends")) {
      const q = decodeURIComponent((u.split("q=")[1] || "")).toLowerCase();
      const list = friendsResponse.filter((f) => !q || f.name.toLowerCase().includes(q) || f.handle.includes(q));
      return Promise.resolve({ ok: true, json: async () => ({ friends: list }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ pack_streaks: [] }) });
  });
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PackStreaksCard petId={1} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  friendsResponse = [BELLA, ECHO];
  postResponse = { ok: true, json: async () => ({ ok: true, pack_id: 9 }) };
  installFetch();
});
afterEach(() => {
  global.fetch = originalFetch;
});

const T = { timeout: 3000 };

describe("PackStreaksCard — friend picker", () => {
  test("focusing the picker lists friends with avatar row: pet name, @handle and owner name", async () => {
    const api = renderCard();
    fireEvent(api.getByTestId("pack-friend-input"), "focus");
    expect(await api.findByTestId("pack-friend-2", {}, T)).toBeTruthy();
    expect(api.getByText("Bella")).toBeTruthy();
    expect(api.getByText("@bella.paws · Beatriz Gomez")).toBeTruthy();
    // No owner name -> localized neutral fallback, never an e-mail / username.
    expect(api.getByText("@echo · Pet parent")).toBeTruthy();
  });

  test("typing searches (debounced) and a friend with an existing pack is disabled with a reason", async () => {
    const api = renderCard();
    fireEvent.changeText(api.getByTestId("pack-friend-input"), "e");
    await waitFor(() => {
      expect(global.fetch.mock.calls.some(([u]) => String(u).includes("pack-friends?q=e"))).toBe(true);
    }, T);
    const echo = await api.findByTestId("pack-friend-5", {}, T);
    expect(echo.props.accessibilityState.disabled).toBe(true);
    expect(api.getByText("Invite sent")).toBeTruthy();
  });

  test("selecting a friend then Start sends the friend's pet id (not free text) and confirms", async () => {
    const api = renderCard();
    fireEvent(api.getByTestId("pack-friend-input"), "focus");
    fireEvent.press(await api.findByTestId("pack-friend-2", {}, T));
    expect(api.getByText("Streak with Bella")).toBeTruthy();
    fireEvent.press(api.getByTestId("pack-start"));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, o]) => o?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(post[1].body)).toEqual({ action: "request", partner_pet_id: 2 });
    }, T);
    expect(await api.findByText("Invite sent to Bella! 🐾", {}, T)).toBeTruthy();
  });

  test("typed text that isn't a selected friend cannot be submitted — a friendly hint shows", async () => {
    const api = renderCard();
    fireEvent.changeText(api.getByTestId("pack-friend-input"), "someone-random");
    fireEvent.press(api.getByTestId("pack-start"));
    expect(api.getByText("Pick a friend from the list to start a streak.")).toBeTruthy();
    expect(global.fetch.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
  });

  test("No friends yet -> explains and offers a path to find friends", async () => {
    friendsResponse = [];
    const api = renderCard();
    fireEvent(api.getByTestId("pack-friend-input"), "focus");
    expect(await api.findByTestId("pack-friend-none-yet", {}, T)).toBeTruthy();
    expect(api.getByText("No friends yet")).toBeTruthy();
    fireEvent.press(api.getByTestId("pack-find-friends"));
    expect(mockPush).toHaveBeenCalledWith("/search");
  });

  test("No friends match when a search finds nothing", async () => {
    const api = renderCard();
    fireEvent.changeText(api.getByTestId("pack-friend-input"), "zzzz");
    expect(await api.findByTestId("pack-friend-no-match", {}, T)).toBeTruthy();
    expect(api.getByText("No friends match")).toBeTruthy();
  });

  test("a server 'not a friend' / 'already exists' answer becomes a friendly line, never a raw error", async () => {
    postResponse = { ok: false, status: 403, json: async () => ({ error: "raw server text", code: "not_a_friend" }) };
    const api = renderCard();
    fireEvent(api.getByTestId("pack-friend-input"), "focus");
    fireEvent.press(await api.findByTestId("pack-friend-2", {}, T));
    fireEvent.press(api.getByTestId("pack-start"));
    expect(await api.findByText("You can only start a pack streak with a dog friend.", {}, T)).toBeTruthy();
    expect(api.queryByText("raw server text")).toBeNull();

    postResponse = { ok: false, status: 409, json: async () => ({ error: "raw", code: "already_exists" }) };
    fireEvent.press(api.getByTestId("pack-start"));
    expect(await api.findByText("You already have a pack streak with Bella.", {}, T)).toBeTruthy();
  });

  test("clearing the selected friend returns to the search field", async () => {
    const api = renderCard();
    fireEvent(api.getByTestId("pack-friend-input"), "focus");
    fireEvent.press(await api.findByTestId("pack-friend-2", {}, T));
    fireEvent.press(api.getByLabelText("Choose a different friend"));
    expect(api.getByTestId("pack-friend-input")).toBeTruthy();
  });
});
