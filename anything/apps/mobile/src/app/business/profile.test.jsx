// Business mode v2 → Profile tab. Proves:
//   • it renders the storefront-as-followers-see-it: the business name + the shared BusinessStatRow
//     (real post/paw/bark/follower counts from the public profile read) + the recent moments grid;
//   • "View public profile" deep-links to the full storefront screen by slug;
//   • tapping a moment opens the shared provider-post detail (via the in-memory handoff).
// The profile/follow hooks are mocked so the test drives the screen logic directly.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const mockActive = {
  activeProvider: { id: 7, slug: "city-vets", name: "City Vets", logo_url: null, bio: "We love pets" },
  providers: [],
  isLoading: false,
};
jest.mock("@/hooks/useActiveProvider", () => ({
  useActiveProvider: () => mockActive,
  __esModule: true,
  default: () => mockActive,
}));

// Public profile read (storefront-by-slug) + the follow query BusinessStatRow reads live.
const mockProfile = { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
jest.mock("@/hooks/useProviders", () => ({
  useProviderProfile: () => mockProfile,
  useProviderFollow: () => ({ data: { following: false, followersCount: 12 } }),
}));

const mockStash = jest.fn();
jest.mock("@/utils/providerPostHandoff", () => ({ stashProviderPost: (...a) => mockStash(...a) }));

import BusinessProfile from "./profile";

beforeEach(() => {
  mockPush.mockReset();
  mockStash.mockReset();
  mockProfile.data = undefined;
  mockProfile.isError = false;
});

test("renders the stat row (real counts) + recent moments", () => {
  mockProfile.data = {
    provider: { id: 7, slug: "city-vets", name: "City Vets", logo_url: null, bio: "We love pets" },
    stats: { postsCount: 4, pawsCount: 9, barksCount: 3 },
    posts: [
      { id: 11, image_urls: ["https://cdn/a.jpg"], comment_count: 2 },
    ],
  };

  const { getByText, getByTestId } = render(<BusinessProfile />);
  // Stat strip values from the public profile read + live follower count.
  expect(getByText("4")).toBeTruthy(); // posts
  expect(getByText("9")).toBeTruthy(); // paws
  expect(getByText("12")).toBeTruthy(); // followers (live)
  expect(getByTestId("business-profile-moment")).toBeTruthy();
});

test("'View public profile' deep-links to the storefront by slug", () => {
  mockProfile.data = { provider: mockActive.activeProvider, stats: {}, posts: [] };
  const { getByTestId } = render(<BusinessProfile />);
  fireEvent.press(getByTestId("business-profile-view-public"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "city-vets" },
  });
});

test("tapping a moment stashes the post and opens the provider-post detail", () => {
  mockProfile.data = {
    provider: mockActive.activeProvider,
    stats: {},
    posts: [{ id: 11, image_urls: ["https://cdn/a.jpg"], comment_count: 2 }],
  };
  const { getByTestId } = render(<BusinessProfile />);
  fireEvent.press(getByTestId("business-profile-moment"));
  expect(mockStash).toHaveBeenCalledWith(
    "7",
    "11",
    expect.objectContaining({ business: expect.objectContaining({ name: "City Vets" }) }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider-post",
    params: { providerId: "7", postId: "11" },
  });
});
