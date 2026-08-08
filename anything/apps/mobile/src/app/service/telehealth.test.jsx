// Render pins for the Telehealth owner screen (ticket 2.18):
//   - discovery lists telehealth vets (real data via useDiscoverProviders('telehealth'));
//     empty → "No telehealth vets yet" (no fakes);
//   - a scheduled consult shows a "Join video consult" button; pressing it joins and pushes
//     the in-app call screen (not an external browser) with the returned room URL;
//   - when the video vendor isn't configured, join surfaces a clean message (no crash);
//   - an ended consult shows "Consult ended" and NO join button.
// All data hooks, router, current-pet, and icons are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockProviders;
let mockConsults;
const mockJoin = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
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
// t() resolves against the REAL English catalog (with {{var}} interpolation), so the gated
// "available at …" copy is asserted as real strings and a mistyped key would render raw.
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);

import TelehealthScreen from "./telehealth";

beforeEach(() => {
  mockProviders = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  mockConsults = { data: [] };
  mockJoin.mockReset();
  mockPush.mockReset();
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

test("a scheduled consult shows Join and joining pushes the in-app call screen with the room URL", async () => {
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
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/service/telehealth-call",
      params: { joinUrl: "https://video/room?t=abc" },
    }),
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
  expect(mockPush).not.toHaveBeenCalled();
});

test("an ended consult shows its status and no Join button", () => {
  mockConsults = {
    data: [{ id: 9, provider_id: 10, provider_name: "Tele Vet Co", status: "ended" }],
  };
  const { getByText, queryByText } = render(<TelehealthScreen />);
  expect(getByText("Consult ended")).toBeTruthy();
  expect(queryByText("Join video consult")).toBeNull();
});

// Distinct status labels (Task 3): each session status reads clearly and a CANCELLED consult
// must read "Cancelled", never "Consult ended".
test("a scheduled consult reads 'Scheduled'", () => {
  mockConsults = {
    data: [{ id: 9, provider_id: 10, provider_name: "Tele Vet Co", status: "scheduled" }],
  };
  const { getByText } = render(<TelehealthScreen />);
  expect(getByText("Scheduled")).toBeTruthy();
});

test("a cancelled consult reads 'Cancelled' (not 'Consult ended') and has no Join button", () => {
  mockConsults = {
    data: [{ id: 9, provider_id: 10, provider_name: "Tele Vet Co", status: "cancelled" }],
  };
  const { getByText, queryByText } = render(<TelehealthScreen />);
  expect(getByText("Cancelled")).toBeTruthy();
  expect(queryByText("Consult ended")).toBeNull();
  expect(queryByText("Join video consult")).toBeNull();
});

// Owner early-join gate (Task 3): more than 5 minutes before the scheduled appointment_date/
// appointment_time shows a friendly "not time yet" message instead of the Join button, and
// never even calls the join API.
test("a consult more than 5 minutes before its scheduled time shows a friendly wait message, no Join button, no API call", () => {
  const farFuture = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const pad = (n) => String(n).padStart(2, "0");
  mockConsults = {
    data: [
      {
        id: 9,
        provider_id: 10,
        provider_name: "Tele Vet Co",
        status: "scheduled",
        appointment_date: `${farFuture.getFullYear()}-${pad(farFuture.getMonth() + 1)}-${pad(farFuture.getDate())}`,
        appointment_time: `${pad(farFuture.getHours())}:${pad(farFuture.getMinutes())}`,
      },
    ],
  };

  const { getByText, queryByText } = render(<TelehealthScreen />);
  expect(queryByText("Join video consult")).toBeNull();
  // Localized time-gate copy: "Your video consult will be available on {date} at {time}."
  expect(getByText(/will be available on/i)).toBeTruthy();
  expect(mockJoin).not.toHaveBeenCalled();
});

// Inside the early-join window (scheduled within 5 minutes of the appointment time) the Join
// affordance IS shown — the gate hides Join only BEFORE the window.
test("a consult within 5 minutes of its scheduled time shows the Join button", () => {
  const soon = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
  const pad = (n) => String(n).padStart(2, "0");
  mockConsults = {
    data: [
      {
        id: 9,
        provider_id: 10,
        provider_name: "Tele Vet Co",
        status: "scheduled",
        appointment_date: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`,
        appointment_time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}`,
      },
    ],
  };

  const { getByText, queryByText } = render(<TelehealthScreen />);
  expect(getByText("Join video consult")).toBeTruthy();
  expect(queryByText(/will be available on/i)).toBeNull();
});

// If the client-side pre-check lets a tap through (uncertain data, clock skew, etc.) and the
// server responds with its 425 "not ready" gate, show the same friendly message instead of a
// generic error.
test("a server 425 (not ready) response shows a friendly wait message, not a generic error", async () => {
  mockConsults = {
    data: [{ id: 9, provider_id: 10, provider_name: "Tele Vet Co", status: "scheduled" }],
  };
  const notReadyError = new Error("Not time to join yet");
  notReadyError.notReady = true;
  mockJoin.mockRejectedValue(notReadyError);

  const { getByText, queryByText } = render(<TelehealthScreen />);
  fireEvent.press(getByText("Join video consult"));

  await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(queryByText("Not time to join yet")).toBeNull(),
  );
  expect(getByText(/once your vet starts the call/i)).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});
