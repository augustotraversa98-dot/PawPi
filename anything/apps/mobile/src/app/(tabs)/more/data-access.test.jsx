// Render pins for the owner's Data Access (care-access trust) screen:
//   - pending grants render under "Pending requests" with Approve/Deny that call
//     useUpdateGrant with the right action (Deny goes through a confirm Alert);
//   - active, non-expired grants render under "Who has access" with Revoke
//     (through a confirm Alert);
//   - an active grant whose expires_at is in the past is NOT shown as active;
//   - both sections show their empty state with no grants;
//   - no active pet → a friendly message, no crash.
// The data/mutation hooks, router, and Alert are mocked — this exercises wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockGrants;
let mockCurrentPet;
const mockMutate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => mockCurrentPet,
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useCareAccessGrants: () => mockGrants,
  useUpdateGrant: () => ({ mutate: mockMutate, isPending: false }),
}));

import DataAccessScreen from "./data-access";

// Far-future / far-past so the expiry check is deterministic without faking time.
const FUTURE = "2999-01-01";
const PAST = "2000-01-01";

beforeEach(() => {
  mockMutate.mockReset();
  mockCurrentPet = { data: { id: 7, name: "Rex" } };
  mockGrants = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  // Auto-press the destructive (non-cancel) button so confirm dialogs resolve.
  jest.spyOn(Alert, "alert").mockImplementation((title, msg, buttons = []) => {
    const target = buttons.find((b) => b.style === "destructive") || buttons[0];
    target?.onPress?.();
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("no active pet → friendly message, no crash", () => {
  mockCurrentPet = { data: null };
  const { getByText } = render(<DataAccessScreen />);
  expect(getByText("No pet selected")).toBeTruthy();
});

test("empty states for both sections when there are no grants", () => {
  const { getByText } = render(<DataAccessScreen />);
  expect(getByText("No pending requests.")).toBeTruthy();
  expect(getByText("No one has access yet.")).toBeTruthy();
});

test("renders a pending grant with human-readable scopes and Approve/Deny", () => {
  mockGrants = {
    data: [
      {
        id: 11,
        status: "pending",
        provider_name: "Happy Paws",
        pet_name: "Rex",
        scopes: ["medical_read", "vaccinations_write"],
      },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<DataAccessScreen />);

  expect(getByText("Happy Paws")).toBeTruthy();
  expect(getByText("wants access to Rex")).toBeTruthy();
  expect(getByText("View medical records")).toBeTruthy();
  expect(getByText("Add vaccinations")).toBeTruthy();
  expect(getByText("Approve")).toBeTruthy();
  expect(getByText("Deny")).toBeTruthy();
});

test("Approve calls useUpdateGrant with action 'approve'", () => {
  mockGrants = {
    data: [{ id: 11, status: "pending", provider_name: "Happy Paws", scopes: [] }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<DataAccessScreen />);

  fireEvent.press(getByText("Approve"));

  expect(mockMutate).toHaveBeenCalledWith(
    { grantId: 11, action: "approve" },
    expect.any(Object),
  );
});

test("Deny confirms then calls useUpdateGrant with action 'deny'", () => {
  mockGrants = {
    data: [{ id: 11, status: "pending", provider_name: "Happy Paws", scopes: [] }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<DataAccessScreen />);

  fireEvent.press(getByText("Deny"));

  expect(Alert.alert).toHaveBeenCalled();
  expect(mockMutate).toHaveBeenCalledWith(
    { grantId: 11, action: "deny" },
    expect.any(Object),
  );
});

test("renders an active, non-expired grant under Who has access with Revoke", () => {
  mockGrants = {
    data: [
      {
        id: 22,
        status: "active",
        provider_name: "City Vet",
        pet_name: "Rex",
        scopes: ["appointments"],
        granted_at: "2026-06-01",
        expires_at: FUTURE,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<DataAccessScreen />);

  expect(getByText("City Vet")).toBeTruthy();
  expect(getByText("has access to Rex")).toBeTruthy();
  expect(getByText("Manage appointments")).toBeTruthy();
  expect(getByText(/Access until/)).toBeTruthy();
  expect(getByText("Revoke access")).toBeTruthy();
});

test("Revoke confirms then calls useUpdateGrant with action 'revoke'", () => {
  mockGrants = {
    data: [
      {
        id: 22,
        status: "active",
        provider_name: "City Vet",
        scopes: [],
        expires_at: null,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<DataAccessScreen />);

  fireEvent.press(getByText("Revoke access"));

  expect(Alert.alert).toHaveBeenCalled();
  expect(mockMutate).toHaveBeenCalledWith(
    { grantId: 22, action: "revoke" },
    expect.any(Object),
  );
});

test("an active grant with a past expires_at is NOT shown as active", () => {
  mockGrants = {
    data: [
      {
        id: 33,
        status: "active",
        provider_name: "Expired Vet",
        scopes: [],
        expires_at: PAST,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText, queryByText } = render(<DataAccessScreen />);

  // Falls out of "Who has access" → empty state, and is not rendered anywhere.
  expect(getByText("No one has access yet.")).toBeTruthy();
  expect(queryByText("Expired Vet")).toBeNull();
});
