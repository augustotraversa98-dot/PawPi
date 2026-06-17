// Render pins for the Telehealth owner screen (ticket 2.18):
//   - discovery lists telehealth vets (real data via useDiscoverProviders('telehealth'));
//     empty → "No telehealth vets yet" (no fakes);
//   - a scheduled consult shows a "Join video consult" button; pressing it joins and opens
//     the returned room URL;
//   - when the video vendor isn't configured, join surfaces a clean message (no crash);
//   - an ended consult shows "Consult ended" and NO join button.
// All data hooks, router, current-pet, icons, and Linking are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

let mockProviders;
let mockConsults;
const mockJoin = jest.fn();
const mockOpenURL = jest.spyOn(Linking, "openURL").mockImplementation(() => {});

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Providers/RatingBadge", () => () => null);
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 55, name: "Rex" } }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: () => mockProviders,
  useTelehealthSessions: () => mockConsults,
  useJoinTelehealth: () => ({ mutateAsync: mockJoin, isPending: false }),
}));

import TelehealthScreen from "./telehealth";

beforeEach(() => {
  mockProviders = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  mockConsults = { data: [] };
  mockJoin.mockReset();
  mockOpenURL.mockReset();
});

test("empty discovery → no-telehealth-vets empty state", () => {
  const { getByText } = render(<TelehealthScreen />);
  expect(getByText("No telehealth vets yet")).toBeTruthy();
});

test("lists telehealth vets from discovery", () => {
  mockProviders = {
    data: [{ id: 1, slug: "tele-vet", name: "Tele Vet Co" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<TelehealthScreen />);
  expect(getByText("Tele Vet Co")).toBeTruthy();
});

test("a scheduled consult shows Join and joining opens the returned room URL", async () => {
  mockConsults = {
    data: [{ id: 9, provider_id: 10, provider_name: "Tele Vet Co", status: "scheduled" }],
  };
  mockJoin.mockResolvedValue({ joinUrl: "https://video/room?t=abc" });

  const { getByText } = render(<TelehealthScreen />);
  fireEvent.press(getByText("Join video consult"));

  await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1));
  expect(mockJoin).toHaveBeenCalledWith(
    expect.objectContaining({ providerId: 10, sessionId: 9, petId: 55 }),
  );
  await waitFor(() =>
    expect(mockOpenURL).toHaveBeenCalledWith("https://video/room?t=abc"),
  );
});

test("join surfaces a clean message when the video vendor isn't configured", async () => {
  mockConsults = {
    data: [{ id: 9, provider_id: 10, provider_name: "Tele Vet Co", status: "scheduled" }],
  };
  mockJoin.mockRejectedValue(new Error("Video consults aren't set up yet"));

  const { getByText } = render(<TelehealthScreen />);
  fireEvent.press(getByText("Join video consult"));

  await waitFor(() =>
    expect(getByText("Video consults aren't set up yet")).toBeTruthy(),
  );
  expect(mockOpenURL).not.toHaveBeenCalled();
});

test("an ended consult shows its status and no Join button", () => {
  mockConsults = {
    data: [{ id: 9, provider_id: 10, provider_name: "Tele Vet Co", status: "ended" }],
  };
  const { getByText, queryByText } = render(<TelehealthScreen />);
  expect(getByText("Consult ended")).toBeTruthy();
  expect(queryByText("Join video consult")).toBeNull();
});
