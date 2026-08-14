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
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));

// Account section deps (BX1): the signed-in identity + the dual-account (also a pet owner) gate.
let mockPets = [];
jest.mock("@/hooks/usePetProfile", () => ({ usePetProfile: () => ({ data: mockPets }) }));
const mockSetAuth = jest.fn();
jest.mock("@/utils/auth/useAuth", () => ({
  useAuth: () => ({ auth: { user: { name: "Ada Vet", email: "ada@city-vets.com" } }, setAuth: mockSetAuth }),
}));

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
  mockReplace.mockReset();
  mockStash.mockReset();
  mockSetAuth.mockReset();
  mockPets = [];
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

// --- BX1: account section (identity + settings + log out) ---

test("shows the signed-in account identity + the active business name", () => {
  const { getByTestId, getAllByText } = render(<BusinessProfile />);
  expect(getByTestId("business-account-name").props.children).toBe("Ada Vet");
  expect(getByTestId("business-account-email").props.children).toBe("ada@city-vets.com");
  // The active business name appears in the header AND the identity card.
  expect(getAllByText("City Vets").length).toBeGreaterThanOrEqual(1);
});

test("Settings row opens the in-business settings route (not the pet-owner tabs)", () => {
  const { getByTestId } = render(<BusinessProfile />);
  fireEvent.press(getByTestId("business-account-settings"));
  // BX3: must stay inside the business group so back returns to Profile, not the feed.
  expect(mockPush).toHaveBeenCalledWith("/business/settings");
  expect(mockPush).not.toHaveBeenCalledWith("/(tabs)/more/settings");
});

test("Log out confirms, then clears the session and returns to welcome", () => {
  const { Alert } = require("react-native");
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<BusinessProfile />);
  fireEvent.press(getByTestId("business-account-logout"));
  // A confirm dialog is shown; drive its destructive "Log out" button.
  expect(spy).toHaveBeenCalledTimes(1);
  const buttons = spy.mock.calls[0][2];
  const logoutBtn = buttons.find((b) => b.style === "destructive");
  return Promise.resolve(logoutBtn.onPress()).then(() => {
    expect(mockSetAuth).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith("/welcome");
    spy.mockRestore();
  });
});

test("'Switch to Pet app' shows only when the account also owns pets", () => {
  const { queryByTestId, rerender } = render(<BusinessProfile />);
  expect(queryByTestId("business-account-switch-pet")).toBeNull();
  mockPets = [{ id: 1, name: "Rex" }];
  rerender(<BusinessProfile />);
  expect(queryByTestId("business-account-switch-pet")).toBeTruthy();
});
