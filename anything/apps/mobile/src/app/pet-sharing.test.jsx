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
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
// The caregiver log-walk sheet pulls in react-query; stub it (its own test covers it).
jest.mock("@/components/Pets/CaregiverLogWalkModal", () => () => null);
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

test("FF2: an ACTIVE FAMILY grant shows a 'Log a walk' action; a Viewer/pending does not", () => {
  mockShared = {
    data: [
      { id: 30, pet_id: 5, pet_name: "Rex", owner_username: "bob", role: "family", status: "active" },
      { id: 31, pet_id: 6, pet_name: "Coco", owner_username: "bob", role: "caregiver", status: "active" },
      { id: 32, pet_id: 7, pet_name: "Duke", owner_username: "bob", role: "family", status: "pending" },
    ],
    isLoading: false,
  };
  const { getByTestId, queryByTestId } = render(<PetSharingScreen />);
  fireEvent.press(getByTestId("tab-shared"));
  expect(getByTestId("log-walk-30")).toBeTruthy(); // family + active
  expect(queryByTestId("log-walk-31")).toBeNull(); // Viewer (caregiver role) → no write
  expect(queryByTestId("log-walk-32")).toBeNull(); // pending → not yet
});
