// Followers / Following list (ticket 2.61): real rows with a paw follow/unfollow
// toggle, type-to-search filtering, row → profile, and empty/no-match states.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockList;
let mockParams;
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Pets/PetAvatar", () => ({ PetAvatar: () => null }));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 4 } }),
}));
jest.mock("@/hooks/usePetSocialProfile", () => ({
  useFollowList: () => ({ data: mockList, isLoading: false }),
}));

import FollowsScreen from "./follows";

beforeEach(() => {
  mockPush.mockReset();
  mockParams = { petId: "7", rel: "followers", petName: "Rex" };
  mockList = [
    { id: 9, name: "Buddy", handle: "buddy", avatar_url: "", owner_name: "Al", is_following: false },
    { id: 10, name: "Coco", handle: "coco", avatar_url: "", owner_name: "Bo", is_following: true },
    { id: 4, name: "Mine", handle: "mine", avatar_url: "", owner_name: "Me", is_following: false },
  ];
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => ({}) }));
});

test("renders rows with name/@handle and the right follow state", () => {
  const { getByText, getByTestId } = render(<FollowsScreen />);
  expect(getByText("Buddy")).toBeTruthy();
  expect(getByText("@buddy")).toBeTruthy();
  // Not-followed → Follow; already-followed → Following.
  expect(getByTestId("follow-toggle-9")).toBeTruthy();
  expect(getByText("Follow")).toBeTruthy();
  expect(getByText("Following")).toBeTruthy();
});

test("you can't follow yourself — no toggle on your own pet row", () => {
  const { queryByTestId } = render(<FollowsScreen />);
  expect(queryByTestId("follow-toggle-4")).toBeNull(); // id 4 === viewer pet
});

test("the search field filters by name/@handle", () => {
  const { getByTestId, queryByText, getByText } = render(<FollowsScreen />);
  fireEvent.changeText(getByTestId("follows-search"), "coc");
  expect(getByText("Coco")).toBeTruthy();
  expect(queryByText("Buddy")).toBeNull();
});

test("tapping Follow calls the follow endpoint and flips to Following", async () => {
  const { getByTestId, getAllByText } = render(<FollowsScreen />);
  fireEvent.press(getByTestId("follow-toggle-9"));
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/pets/9/follow",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  // Both rows now read "Following" (9 flipped, 10 already).
  expect(getAllByText("Following").length).toBe(2);
});

test("tapping a row opens that pet's profile", () => {
  const { getByTestId } = render(<FollowsScreen />);
  fireEvent.press(getByTestId("follow-row-9"));
  expect(mockPush).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: "/pet-profile",
      params: expect.objectContaining({ petId: "9" }),
    }),
  );
});

test("empty state when there are no followers (no fakes)", () => {
  mockList = [];
  const { getByText } = render(<FollowsScreen />);
  expect(getByText("No followers yet")).toBeTruthy();
});

test("no-match state when the search filters everything out", () => {
  const { getByTestId, getByText } = render(<FollowsScreen />);
  fireEvent.changeText(getByTestId("follows-search"), "zzzzz");
  expect(getByText("No matches")).toBeTruthy();
});
