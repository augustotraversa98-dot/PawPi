// Discover sneak-peek, end to end on the client: a locked viewer taps a tile and is prompted;
// after they post (useCreatePost) Discover refetches on its own — the SAME mounted screen — and
// the tile then opens the pet profile. Real useDiscover + useCreatePost over a mocked fetch.

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => <View {...props} /> };
});
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useSearch", () => ({
  useDebouncedValue: (v) => v,
  useSearch: () => ({ data: { pets: [], owners: [], providers: [] }, isLoading: false }),
}));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: null }) }));

import SearchScreen from "./search";
import { useCreatePost } from "@/hooks/useFeedPosts";

const moment = (locked) => ({
  id: 5,
  pet_id: 2,
  user_id: 7,
  image_url: "https://cdn/p.jpg",
  caption: "Beach",
  pet_name: "Bella",
  ...(locked ? { locked: true } : {}),
});

test("posting refetches Discover so a previously-locked tile opens without leaving the screen", async () => {
  let posted = false;
  global.fetch = jest.fn(async (url) => {
    if (String(url).startsWith("/api/discover")) {
      return { ok: true, json: async () => ({ profiles: [], moments: [moment(!posted)] }) };
    }
    if (String(url) === "/api/posts") {
      posted = true;
      return { ok: true, json: async () => ({ post: { id: 99, pet_id: 4 } }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  // The "composer" (useCreatePost) lives in the same tree, as the Feed does in the real app.
  let mutate;
  function Poster() {
    mutate = useCreatePost().mutateAsync;
    return null;
  }
  const { getByTestId, queryByText } = render(
    <>
      <SearchScreen />
      <Poster />
    </>,
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(getByTestId("discover-moment")).toBeTruthy());

  // Locked: tap prompts, does not open.
  fireEvent.press(getByTestId("discover-moment"));
  expect(queryByText("Post your daily moment to see this")).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.press(getByTestId("discover-locked-prompt-dismiss"));

  // The viewer posts (from the Feed composer in the real app).
  await act(async () => {
    await mutate({ pet_id: 4, image_url: "x" });
  });

  // Discover refetched (2 GETs) with the tile no longer locked...
  await waitFor(() =>
    expect(global.fetch.mock.calls.filter(([u]) => String(u).startsWith("/api/discover"))).toHaveLength(2),
  );
  await waitFor(() => expect(client.getQueryData(["discover", 12]).moments[0].locked).toBeUndefined());

  // ...so the same mounted tile now opens the pet profile instead of prompting.
  fireEvent.press(getByTestId("discover-moment"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/pet-profile", params: { petId: "2" } });
  expect(queryByText("Post your daily moment to see this")).toBeNull();
});
