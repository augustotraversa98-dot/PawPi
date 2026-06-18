// Render pins for the Dog Social Profile screen:
//   - the real @handle, owner and the five real stat counts render from the
//     fetched profile (not from fake param defaults);
//   - the follow button shows on another pet but is hidden on your own pet.
// The data hooks are mocked, so this exercises the screen's wiring, not fetch.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// Per-test fixtures the mocked hooks read from (must be `mock*`-prefixed to be
// referenceable inside the hoisted jest.mock factories).
let mockProfile;
let mockViewer;
let mockParams;
const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, navigate: mockNavigate }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Pets/PetAvatar", () => ({ PetAvatar: () => null }));
jest.mock("@/components/More/OwnerMenu", () => {
  const { Text } = require("react-native");
  return { OwnerMenu: () => <Text>OWNER_MENU</Text> };
});
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Feed/PostDetailModal", () => ({
  PostDetailModal: () => null,
}));
jest.mock("@/components/Feed/BarkModal", () => ({ BarkModal: () => null }));
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutate: jest.fn() }),
  useUpdatePostCaption: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockViewer }),
}));
jest.mock("@/hooks/usePetSocialProfile", () => ({
  usePetSocialProfile: () => ({
    data: mockProfile,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useToggleFollow: () => ({ mutate: jest.fn() }),
}));
jest.mock("@/hooks/useDMs", () => ({
  useStartDM: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import PetProfileScreen from "./pet-profile";

beforeEach(() => {
  mockPush.mockReset();
  mockNavigate.mockReset();
  mockParams = { petId: "7", dogName: "Buddy", ownerName: "Alice" };
  mockProfile = {
    pet: {
      id: 7,
      name: "Rex",
      handle: "rexthedog",
      avatar_url: "",
      breed: "Beagle",
      age_years: 2,
      age_months: 3,
    },
    owner: { full_name: "Bob", username: "bob" },
    stats: {
      totalPosts: 5,
      totalPaws: 12,
      totalBarks: 4,
      followers: 8,
      following: 3,
    },
    isFollowing: false,
    posts: [],
  };
});

test("renders the real handle, owner and the five stat labels from the fetch", () => {
  mockViewer = { id: 4 };
  const { getByText, queryByText } = render(<PetProfileScreen />);

  // Real identity wins over the placeholder params.
  expect(getByText("Rex")).toBeTruthy();
  expect(getByText("@rexthedog")).toBeTruthy();
  expect(getByText("with Bob")).toBeTruthy();
  expect(queryByText("Buddy")).toBeNull();
  expect(queryByText("with Alice")).toBeNull();

  // Five real stat pills.
  expect(getByText("Daily posts")).toBeTruthy();
  expect(getByText("Paws")).toBeTruthy();
  expect(getByText("Barks")).toBeTruthy();
  expect(getByText("Followers")).toBeTruthy();
  expect(getByText("Following")).toBeTruthy();
  expect(getByText("8")).toBeTruthy(); // followers count
});

test("shows the empty state, not fakes, when there are no posts", () => {
  mockViewer = { id: 4 };
  const { getByText } = render(<PetProfileScreen />);
  expect(getByText("No daily posts yet")).toBeTruthy();
});

test("shows the Follow button on another pet's profile", () => {
  mockViewer = { id: 4 }; // viewer 4 ≠ profile pet 7
  const { getByText } = render(<PetProfileScreen />);
  expect(getByText("Follow +")).toBeTruthy();
});

test("hides the Follow button on your own pet's profile", () => {
  mockViewer = { id: 7 }; // viewer pet === profile pet
  const { queryByText } = render(<PetProfileScreen />);
  expect(queryByText("Follow +")).toBeNull();
  expect(queryByText("Following ✓")).toBeNull();
});

test("hides the Follow button when there is no active pet", () => {
  mockViewer = null;
  const { queryByText } = render(<PetProfileScreen />);
  expect(queryByText("Follow +")).toBeNull();
});

describe("Profile tab — embedded mode (ticket 2.60)", () => {
  test("non-embedded (pushed route) shows a Back button, no owner menu", () => {
    mockViewer = { id: 4 };
    const { getByText, queryByText } = render(<PetProfileScreen />);
    expect(getByText("Back")).toBeTruthy();
    expect(queryByText("OWNER_MENU")).toBeNull();
    expect(getByText("Pet profile")).toBeTruthy();
  });

  test("embedded (Profile tab) shows the ☰ owner menu instead of Back", () => {
    mockViewer = { id: 4 };
    const { getByText, queryByText } = render(<PetProfileScreen embedded />);
    expect(getByText("OWNER_MENU")).toBeTruthy(); // burger/menu present
    expect(queryByText("Back")).toBeNull();
    expect(getByText("Profile")).toBeTruthy();
  });

  test("tapping the Followers / Following counts opens the lists (2.61/2.67)", () => {
    mockViewer = { id: 4 };
    const { getByTestId } = render(<PetProfileScreen />);

    // 2.67: navigates to the ROOT `follows` route via an absolute href string,
    // with a NON-empty petId + the right rel.
    fireEvent.press(getByTestId("stat-Followers"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/follows?petId=7"),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("rel=followers"),
    );

    fireEvent.press(getByTestId("stat-Following"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("rel=following"),
    );
  });

  test("2.67: embedded tap resolves a non-empty petId from the active pet (no param)", () => {
    // Embedded Profile tab: no route param, the viewer's active pet drives it.
    mockParams = {};
    mockViewer = { id: 7 };
    const { getByTestId } = render(<PetProfileScreen embedded />);

    fireEvent.press(getByTestId("stat-Followers"));
    // Never an empty petId — it resolves from the active pet.
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/follows?petId=7"),
    );
    const href = mockNavigate.mock.calls[0][0];
    expect(href).not.toContain("petId=&");
  });

  test("2.67: no dead tap while the current pet is loading", () => {
    // Embedded tab, no param, current pet not loaded yet → the counts are not
    // tappable (rendered as plain text), so there's no dead tap / empty nav.
    mockParams = {};
    mockViewer = null;
    const { getByText, queryByTestId } = render(<PetProfileScreen embedded />);
    expect(getByText("Followers")).toBeTruthy(); // count still shows
    expect(queryByTestId("stat-Followers")).toBeNull(); // but not interactive
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("embedded falls back to the viewer's own pet (no route param)", () => {
    // No petId param; the tab shows the current pet's profile.
    mockParams = {};
    mockViewer = { id: 7 }; // current pet === the fetched profile pet (7)
    const { getByText, queryByText } = render(<PetProfileScreen embedded />);
    // Renders the current pet's social profile…
    expect(getByText("Rex")).toBeTruthy();
    // …and it's your own pet, so no Follow affordance.
    expect(queryByText("Follow +")).toBeNull();
  });
});
