// Render pins for the family/caregiver sharing screen (ticket 2.47):
//   - owner can pick a role + invite a searched user (fires the invite mutation);
//   - existing grants render with a revoke control;
//   - the "Shared with me" tab shows pending invites with accept/decline.
// Data hooks + router are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockGrants;
let mockShared;
let mockInvite;
let mockRespond;
let mockRevoke;
let mockSearch;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
jest.mock("@/hooks/useSearch", () => ({
  useDebouncedValue: (v) => v,
  useSearch: () => mockSearch,
}));
jest.mock("@/hooks/usePetSharing", () => ({
  usePetGrants: () => mockGrants,
  useSharedWithMe: () => mockShared,
  useInviteCaregiver: () => mockInvite,
  useRespondGrant: () => mockRespond,
  useRevokeGrant: () => mockRevoke,
}));

import PetSharingScreen from "./pet-sharing";

beforeEach(() => {
  mockGrants = {
    data: [{ id: 10, grantee_username: "jane", role: "family", status: "active" }],
    isLoading: false,
  };
  mockShared = {
    data: [{ id: 20, pet_name: "Bella", owner_username: "bob", role: "caregiver", status: "pending" }],
    isLoading: false,
  };
  mockInvite = { mutate: jest.fn(), isPending: false };
  mockRespond = { mutate: jest.fn(), isPending: false };
  mockRevoke = { mutate: jest.fn(), isPending: false };
  mockSearch = { data: { owners: [{ id: 8, username: "kim" }] }, isFetching: false };
});

test("inviting a searched user with the caregiver role fires the invite mutation", () => {
  const { getByTestId } = render(<PetSharingScreen />);
  fireEvent.press(getByTestId("role-caregiver"));
  fireEvent.press(getByTestId("invite-8"));
  expect(mockInvite.mutate).toHaveBeenCalledWith({
    granteeUserId: 8,
    granteeUsername: "kim",
    role: "caregiver",
    expiresAt: undefined,
  });
});

test("an existing grant renders and can be revoked", () => {
  const { getByText, getByTestId } = render(<PetSharingScreen />);
  expect(getByText("@jane")).toBeTruthy();
  fireEvent.press(getByTestId("revoke-10"));
  expect(mockRevoke.mutate).toHaveBeenCalledWith(10);
});

test("the 'Shared with me' tab shows a pending invite with accept/decline", () => {
  const { getByTestId, getByText } = render(<PetSharingScreen />);
  fireEvent.press(getByTestId("tab-shared"));
  expect(getByText("Bella")).toBeTruthy();
  fireEvent.press(getByTestId("accept-20"));
  expect(mockRespond.mutate).toHaveBeenCalledWith({ grantId: 20, accept: true });
  fireEvent.press(getByTestId("decline-20"));
  expect(mockRespond.mutate).toHaveBeenCalledWith({ grantId: 20, accept: false });
});
