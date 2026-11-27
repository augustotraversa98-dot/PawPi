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
let mockLeave;
let mockResend;
let mockSearch;
let mockCurrentPet;
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() };

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => globalThis.__sharingParams ?? {},
  Redirect: () => {
    throw new Error("pet-sharing must never render a <Redirect>");
  },
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
  useCurrentPet: () => mockCurrentPet,
  usePetProfile: () => ({ data: globalThis.__sharingPets }),
}));
jest.mock("@/hooks/useSearch", () => ({
  useDebouncedValue: (v) => v,
  useSearch: () => mockSearch,
}));
// Invite codes have their own tests (components/Pets/inviteCode.test.jsx).
jest.mock("@/components/Pets/InviteCodePanel", () => () => null);
jest.mock("@/components/Pets/RedeemInviteCard", () => () => null);
jest.mock("@/hooks/usePetSharing", () => ({
  usePetGrants: (petId) => {
    globalThis.__sharingGrantsPet = petId;
    return mockGrants;
  },
  useSharedWithMe: () => mockShared,
  useInviteCaregiver: () => mockInvite,
  useRespondGrant: () => mockRespond,
  useRevokeGrant: () => mockRevoke,
  useLeaveGrant: () => mockLeave,
  useResendInvite: () => mockResend,
}));

import PetSharingScreen from "./pet-sharing";

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentPet = { data: { id: 1, name: "Rex" }, isLoading: false };
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
  mockLeave = { mutate: jest.fn(), isPending: false };
  mockResend = { mutate: jest.fn(), isPending: false };
  mockSearch = { data: { owners: [{ id: 8, username: "kim" }] }, isFetching: false };
});

describe("opened for one dog from Data access (?petId=)", () => {
  afterEach(() => {
    delete globalThis.__sharingParams;
    delete globalThis.__sharingPets;
  });

  test("manages that dog, whichever is on screen", () => {
    globalThis.__sharingParams = { petId: "2" };
    globalThis.__sharingPets = [{ id: 1, name: "Rex" }, { id: 2, name: "Luna" }];
    render(<PetSharingScreen />);
    expect(globalThis.__sharingGrantsPet).toBe(2);
  });

  test("a dog shared with this person is not one they can manage: the dog on screen stays", () => {
    globalThis.__sharingParams = { petId: "2" };
    globalThis.__sharingPets = [{ id: 1, name: "Rex" }, { id: 2, name: "Luna", is_shared: true }];
    render(<PetSharingScreen />);
    expect(globalThis.__sharingGrantsPet).toBe(1);
  });
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


// Regression (More menu → "Familia y cuidadores" → onboarding): the screen must behave sensibly for ANY account state
// and never navigate anywhere on its own — in particular never to onboarding.
describe("pet-sharing never navigates away, whatever the pet state", () => {
  const noNavigation = () => {
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  };

  test("an account WITH a dog renders the screen and stays put", () => {
    const { getByText, queryByTestId } = render(<PetSharingScreen />);
    expect(getByText("petSharing.screenTitle")).toBeTruthy();
    expect(queryByTestId("pet-sharing-no-pet")).toBeNull();
    noNavigation();
  });

  test("an account with NO dog shows an empty state (no redirect, no crash)", () => {
    mockCurrentPet = { data: null, isLoading: false };
    mockGrants = { data: undefined, isLoading: false };
    const { getByText, getByTestId, queryByTestId } = render(<PetSharingScreen />);

    expect(getByText("petSharing.screenTitle")).toBeTruthy();
    expect(getByTestId("pet-sharing-no-pet")).toBeTruthy();
    expect(getByText("petSharing.noPetTitle")).toBeTruthy();
    expect(getByText("petSharing.noPetBody")).toBeTruthy();
    expect(queryByTestId("role-family")).toBeNull(); // no invite UI without a dog to share
    noNavigation();
  });

  test("while the pets read is still LOADING it shows a spinner — not the empty state, and no navigation", () => {
    mockCurrentPet = { data: undefined, isLoading: true };
    const { getByTestId, queryByTestId } = render(<PetSharingScreen />);

    expect(getByTestId("pet-sharing-loading")).toBeTruthy();
    expect(queryByTestId("pet-sharing-no-pet")).toBeNull();
    noNavigation();
  });

  test("an account with no dog can still use 'Shared with me' (a caregiver for someone else's dog)", () => {
    mockCurrentPet = { data: null, isLoading: false };
    const { getByTestId, getByText } = render(<PetSharingScreen />);

    fireEvent.press(getByTestId("tab-shared"));
    expect(getByText("Bella")).toBeTruthy(); // the pet shared WITH this account is listed
    noNavigation();
  });
});

// EN + ES parity for the new empty-state copy.
describe("pet-sharing empty-state copy exists in EN and ES", () => {
  const en = require("@/i18n/locales/en.json");
  const es = require("@/i18n/locales/es.json");
  test.each(["noPetTitle", "noPetBody"])("%s", (key) => {
    expect(typeof en.petSharing[key]).toBe("string");
    expect(typeof es.petSharing[key]).toBe("string");
    expect(en.petSharing[key].length).toBeGreaterThan(0);
    expect(es.petSharing[key].length).toBeGreaterThan(0);
    expect(es.petSharing[key]).not.toBe(en.petSharing[key]);
  });
});

// Night run #4 item 9: resend on a pending invite.
describe("resend invite", () => {
  const rows = [
    { id: 10, grantee_username: "jane", role: "family", status: "active" },
    { id: 11, grantee_username: "leo", role: "caregiver", status: "pending" },
    { id: 12, grantee_username: "ana", role: "family", status: "expired" },
  ];
  beforeEach(() => {
    mockGrants = { data: rows, isLoading: false };
    require("@/store/inviteCooldownStore").default.getState().reset();
  });

  test("only a PENDING row has a Resend button", () => {
    const { queryByTestId } = render(<PetSharingScreen />);
    expect(queryByTestId("resend-11")).toBeTruthy();
    expect(queryByTestId("resend-10")).toBeNull();
    expect(queryByTestId("resend-12")).toBeNull();
  });

  test("pressing it resends that invite", () => {
    const { getByTestId } = render(<PetSharingScreen />);
    fireEvent.press(getByTestId("resend-11"));
    expect(mockResend.mutate).toHaveBeenCalledWith(11);
  });

  test("while cooling down it says Sent and does nothing", () => {
    require("@/store/inviteCooldownStore").default.getState().startCooldown(11, 60000);
    const { getByTestId, getByText } = render(<PetSharingScreen />);
    expect(getByText("sharedDog.resendSent")).toBeTruthy();
    expect(getByTestId("resend-11").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(getByTestId("resend-11"));
    expect(mockResend.mutate).not.toHaveBeenCalled();
  });
});
