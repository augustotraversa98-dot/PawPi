// Family sharing (PR5a): More -> Dog Profile ("My Dog") for a dog the person owns vs one shared with them. The owner and family can edit the
// profile; a caregiver cannot. A shared dog shows the viewer's role and who shared it; the owner's own dog shows no badge. EN + ES.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockPet;
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "en").useTranslation(),
}));
jest.mock("@/hooks/useBottomClearance", () => () => 0);
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: mockPet, isLoading: false }) }));
jest.mock("@/hooks/useGroomSessions", () => ({ useGroomSessions: () => ({ data: [] }) }));
jest.mock("@/utils/auth/useUser", () => () => ({ data: { id: "u1" } }));

import ProfileScreen from "./profile";

const base = { id: 7, name: "Luna", breed: "Beagle", weight: 10, weight_unit: "kg" };
const owner = { ...base, is_shared: false, access_role: "owner" };
const family = { ...base, is_shared: true, access_role: "family", owner_display: { full_name: "Sam" } };
const caregiver = { ...base, is_shared: true, access_role: "caregiver", owner_display: { full_name: "Sam" } };

describe.each([
  ["en", { family: "Family", caregiver: "Caregiver", by: "Shared by Sam" }],
  ["es", { family: "Familia", caregiver: "Cuidador", by: "Compartido por Sam" }],
])("Dog Profile by role (%s)", (lang, w) => {
  beforeEach(() => {
    global.__lang = lang;
    mockPush.mockClear();
  });
  afterAll(() => {
    delete global.__lang;
  });

  test("owner: edit button works, no 'shared' badge", () => {
    mockPet = owner;
    const { getByTestId, queryByTestId } = render(<ProfileScreen />);
    expect(queryByTestId("shared-pet-badge")).toBeNull();
    fireEvent.press(getByTestId("dog-profile-edit"));
    expect(mockPush).toHaveBeenCalledWith("/more/profile-edit");
  });

  test("family partner: can edit, and sees 'Family · Shared by Sam'", () => {
    mockPet = family;
    const { getByTestId } = render(<ProfileScreen />);
    expect(getByTestId("shared-pet-role").props.children).toBe(w.family);
    expect(getByTestId("shared-pet-owner").props.children).toBe(w.by);
    fireEvent.press(getByTestId("dog-profile-edit"));
    expect(mockPush).toHaveBeenCalledWith("/more/profile-edit");
  });

  test("caregiver: sees the profile and the role badge but there is NO edit button", () => {
    mockPet = caregiver;
    const { getByTestId, queryByTestId } = render(<ProfileScreen />);
    expect(getByTestId("shared-pet-role").props.children).toBe(w.caregiver);
    expect(queryByTestId("dog-profile-edit")).toBeNull();
  });
});
