// Family sharing (PR5a): the Family & caregivers screen for every kind of viewer — owner, family co-owner, caregiver, a person whose ONLY dog
// is shared with them, a person with no dog, loading, and a person whose access was just revoked — in English AND Spanish.
// Data hooks + router are mocked; the permission helper, the badge and the labels are the REAL ones.

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";

let mockCurrentPet;
let mockGrants;
let mockShared;
let mockLeave;
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() };

jest.mock("expo-router", () => ({ useRouter: () => mockRouter,
  useLocalSearchParams: () => globalThis.__sharingParams ?? {} }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// The language is chosen per describe block through this global, so ONE module serves EN and ES.
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "en").useTranslation(),
}));
jest.mock("@/components/Pets/CaregiverLogWalkModal", () => () => null);
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => mockCurrentPet, usePetProfile: () => ({ data: undefined }) }));
jest.mock("@/hooks/useSearch", () => ({
  useDebouncedValue: (v) => v,
  useSearch: () => ({ data: { owners: [] }, isFetching: false }),
}));
// Invite codes have their own tests (components/Pets/inviteCode.test.jsx).
jest.mock("@/components/Pets/InviteCodePanel", () => () => null);
jest.mock("@/components/Pets/RedeemInviteCard", () => () => null);
jest.mock("@/hooks/usePetSharing", () => ({
  usePetGrants: (petId) => (petId ? mockGrants : { data: undefined, isLoading: false }),
  useSharedWithMe: () => mockShared,
  useInviteCaregiver: () => ({ mutate: jest.fn(), isPending: false }),
  useRespondGrant: () => ({ mutate: jest.fn(), isPending: false }),
  useRevokeGrant: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveGrant: () => mockLeave,
  useResendInvite: () => ({ mutate: jest.fn(), isPending: false }),
}));

import PetSharingScreen from "./pet-sharing";

const ownPet = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const sharedPet = (role) => ({
  id: 7, name: "Luna", is_shared: true, access_role: role,
  owner_display: { full_name: "Sam", username: "sam", avatar_url: null },
});

const T = {
  en: {
    ownerOnlyTitle: "Only the owner manages sharing",
    noPetTitle: "Add your dog first",
    familyBadge: "Family",
    caregiverBadge: "Caregiver",
    sharedBySam: "Shared by Sam",
    household: "See the household",
    active: "Active",
    pending: "Pending",
    revoked: "Access removed",
    left: "Left",
    former: "Former member",
    leave: "Leave",
  },
  es: {
    ownerOnlyTitle: "Solo el dueño administra quién tiene acceso",
    noPetTitle: "Primero sumá a tu perro",
    familyBadge: "Familia",
    caregiverBadge: "Cuidador",
    sharedBySam: "Compartido por Sam",
    household: "Ver el hogar",
    active: "Activo",
    pending: "Pendiente",
    revoked: "Acceso quitado",
    left: "Se fue",
    former: "Ex integrante",
    leave: "Salir",
  },
};

let alertSpy;
beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockCurrentPet = { data: ownPet, isLoading: false };
  mockGrants = { data: [], isLoading: false };
  mockShared = { data: [], isLoading: false };
  mockLeave = { mutate: jest.fn(), isPending: false };
});
afterEach(() => alertSpy.mockRestore());

describe.each(["en", "es"])("Family & caregivers screen (%s)", (lang) => {
  const w = T[lang];
  beforeEach(() => {
    global.__lang = lang;
  });
  afterAll(() => {
    delete global.__lang;
  });

  test("OWNER: sees the invite controls and the people with access, with TRANSLATED statuses and 'Former member'", () => {
    mockGrants = {
      data: [
        { id: 10, grantee_username: "maria", role: "family", status: "active" },
        { id: 11, grantee_username: "joe", role: "caregiver", status: "pending" },
        { id: 12, grantee_username: "ann", role: "family", status: "revoked" },
        { id: 13, grantee_username: "former_member_8f3a1c", role: "family", status: "left" },
      ],
      isLoading: false,
    };
    const { getByTestId, queryByTestId, getByText, queryByText, queryAllByText } = render(<PetSharingScreen />);
    expect(getByTestId("role-family")).toBeTruthy();
    expect(getByTestId("invite-search")).toBeTruthy();
    expect(queryByTestId("pet-sharing-owner-only")).toBeNull();
    expect(getByText(new RegExp(w.active))).toBeTruthy();
    expect(getByText(new RegExp(w.pending))).toBeTruthy();
    expect(getByText(new RegExp(w.revoked))).toBeTruthy();
    expect(getByText(new RegExp(w.left))).toBeTruthy();
    expect(getByText(w.former)).toBeTruthy(); // the anonymised ex-member, never "@former_member_8f3a1c"
    expect(queryByText(/former_member_/)).toBeNull();
    // raw machine words never reach the screen
    expect(queryAllByText(/\b(pending|active|revoked)\b/)).toHaveLength(0);
    // a revoked / left row has no trash control (it would only 404 / no-op); active and pending do
    expect(getByTestId("revoke-10")).toBeTruthy();
    expect(getByTestId("revoke-11")).toBeTruthy();
    expect(queryByTestId("revoke-12")).toBeNull();
    expect(queryByTestId("revoke-13")).toBeNull();
  });

  test.each([
    ["family", "familyBadge"],
    ["caregiver", "caregiverBadge"],
  ])("%s on a SHARED dog: no invite / revoke controls, who the owner is, their own role, a way to the household — and NEVER 'Add your dog first'", (role, badgeKey) => {
    mockCurrentPet = { data: sharedPet(role), isLoading: false };
    const { getByTestId, queryByTestId, getByText, queryByText } = render(<PetSharingScreen />);
    expect(getByTestId("pet-sharing-owner-only")).toBeTruthy();
    expect(getByText(w.ownerOnlyTitle)).toBeTruthy();
    expect(getByText(w[badgeKey])).toBeTruthy();
    expect(getByText(w.sharedBySam)).toBeTruthy();
    expect(queryByTestId("role-family")).toBeNull();
    expect(queryByTestId("invite-search")).toBeNull();
    expect(queryByTestId("pet-sharing-no-pet")).toBeNull();
    expect(queryByText(w.noPetTitle)).toBeNull();

    fireEvent.press(getByTestId("open-household"));
    expect(mockRouter.push).toHaveBeenCalledWith("/household");
    expect(getByText(w.household)).toBeTruthy();
  });

  test("a person whose ONLY dog is shared with them uses the 'Shared with me' list: translated status, Leave with a confirmation", () => {
    mockCurrentPet = { data: sharedPet("family"), isLoading: false };
    mockShared = {
      data: [{ id: 20, pet_id: 7, pet_name: "Luna", owner_username: "sam", role: "family", status: "active" }],
      isLoading: false,
    };
    const { getByTestId, getByText } = render(<PetSharingScreen />);
    fireEvent.press(getByTestId("tab-shared"));
    expect(getByText("Luna")).toBeTruthy();
    // the status inside "from @sam · Family · …" is the translated word (capitalised), never the server's raw "active"
    expect(getByText(new RegExp(`@sam .*${w.active}`))).toBeTruthy();
    fireEvent.press(getByTestId("leave-20"));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alertSpy.mock.calls[0];
    expect(title).toContain("Luna");
    expect(body).toContain("Luna");
    expect(buttons.map((b) => b.text)).toContain(w.leave);
    // confirming leaves; cancelling does nothing
    expect(mockLeave.mutate).not.toHaveBeenCalled();
    buttons.find((b) => b.text === w.leave).onPress();
    expect(mockLeave.mutate).toHaveBeenCalledWith(20);
  });

  test("a PENDING invite shows the translated 'pending' word and accept / decline, and no Leave", () => {
    mockCurrentPet = { data: null, isLoading: false };
    mockShared = {
      data: [{ id: 21, pet_id: 9, pet_name: "Bella", owner_username: "bob", role: "caregiver", status: "pending" }],
      isLoading: false,
    };
    const { getByTestId, queryByTestId, getByText } = render(<PetSharingScreen />);
    fireEvent.press(getByTestId("tab-shared"));
    expect(getByText(new RegExp(w.pending))).toBeTruthy();
    expect(getByTestId("accept-21")).toBeTruthy();
    expect(queryByTestId("leave-21")).toBeNull();
  });

  test("a person with NO dog at all: the plain no-dog state (this is the ONLY place 'Add your dog first' appears), no redirect", () => {
    mockCurrentPet = { data: null, isLoading: false };
    const { getByTestId, getByText } = render(<PetSharingScreen />);
    expect(getByTestId("pet-sharing-no-pet")).toBeTruthy();
    expect(getByText(w.noPetTitle)).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("LOADING: a spinner, not the no-dog state and not the owner-only card", () => {
    mockCurrentPet = { data: undefined, isLoading: true };
    const { getByTestId, queryByTestId, queryByText } = render(<PetSharingScreen />);
    expect(getByTestId("pet-sharing-loading")).toBeTruthy();
    expect(queryByTestId("pet-sharing-owner-only")).toBeNull();
    expect(queryByText(w.noPetTitle)).toBeNull();
  });

  test("REVOKED while the screen is open: the dog disappears and the screen settles into the no-dog state (no crash, no redirect)", () => {
    mockCurrentPet = { data: sharedPet("family"), isLoading: false };
    const { getByTestId, rerender } = render(<PetSharingScreen />);
    expect(getByTestId("pet-sharing-owner-only")).toBeTruthy();
    mockCurrentPet = { data: null, isLoading: false };
    rerender(<PetSharingScreen />);
    expect(getByTestId("pet-sharing-no-pet")).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
