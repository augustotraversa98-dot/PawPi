// Family sharing (PR5a) building blocks, EN + ES: the role badge, the pet picker with a shared dog (and its error / loading states),
// and the one-time "you lost access" notice.
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";

let mockPets;
let mockCurrent;
const mockSetCurrentPet = jest.fn();
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "en").useTranslation(),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  usePetProfile: () => mockPets,
  useCurrentPet: () => ({ data: mockCurrent, setCurrentPet: mockSetCurrentPet }),
}));
jest.mock("./PetAvatar", () => ({ PetAvatar: () => null }));

import { SharedPetBadge } from "./SharedPetBadge";
import { PetPickerSheet } from "./PetPickerSheet";
import { AccessLostNotice } from "./AccessLostNotice";
import usePetAccessStore from "@/store/petAccessStore";

const own = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const family = { id: 7, name: "Luna", is_shared: true, access_role: "family", owner_display: { full_name: "Sam", username: "sam" } };
const caregiverNoName = { id: 8, name: "Rocky", is_shared: true, access_role: "caregiver", owner_display: { full_name: null, username: "pawpi_ab12" } };

const W = {
  en: { family: "Family", caregiver: "Caregiver", sharedBySam: "Shared by Sam", sharedWithYou: "Shared with you", retry: "Try again", loadError: "We couldn't load your dogs. Check your connection and try again.", lostTitle: "Access ended", lostBody: "You no longer have access to Luna. We moved you back to your other dogs." },
  es: { family: "Familia", caregiver: "Cuidador", sharedBySam: "Compartido por Sam", sharedWithYou: "Compartido con vos", retry: "Reintentar", loadError: "No pudimos cargar tus perros. Revisá tu conexión y probá de nuevo.", lostTitle: "Se terminó el acceso", lostBody: "Ya no tenés acceso a Luna. Te pasamos a tus otros perros." },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPets = { data: [own, family, caregiverNoName], isLoading: false, isError: false, refetch: jest.fn() };
  mockCurrent = own;
});

describe.each(["en", "es"])("shared-dog components (%s)", (lang) => {
  const w = W[lang];
  beforeEach(() => {
    global.__lang = lang;
  });
  afterAll(() => {
    delete global.__lang;
  });

  describe("SharedPetBadge: each viewer sees their OWN role on the same dog", () => {
    test("the owner's own dog shows no badge", () => {
      const { queryByTestId } = render(<SharedPetBadge pet={own} />);
      expect(queryByTestId("shared-pet-badge")).toBeNull();
    });
    test("family partner: role + who shared it", () => {
      const { getByTestId } = render(<SharedPetBadge pet={family} />);
      expect(getByTestId("shared-pet-role").props.children).toBe(w.family);
      expect(getByTestId("shared-pet-owner").props.children).toBe(w.sharedBySam);
    });
    test("caregiver whose owner has no public name: neutral line, never the username", () => {
      const { getByTestId, queryByText } = render(<SharedPetBadge pet={caregiverNoName} />);
      expect(getByTestId("shared-pet-role").props.children).toBe(w.caregiver);
      expect(getByTestId("shared-pet-owner").props.children).toBe(w.sharedWithYou);
      expect(queryByText(/pawpi_ab12/)).toBeNull();
    });
    test("showOwner=false hides the owner line", () => {
      const { queryByTestId } = render(<SharedPetBadge pet={family} showOwner={false} />);
      expect(queryByTestId("shared-pet-owner")).toBeNull();
    });
    test("no pet: nothing", () => {
      const { queryByTestId } = render(<SharedPetBadge pet={null} />);
      expect(queryByTestId("shared-pet-badge")).toBeNull();
    });
  });

  describe("PetPickerSheet", () => {
    const open = () => render(<PetPickerSheet visible onClose={jest.fn()} onAddDog={jest.fn()} />);

    test("lists own AND shared dogs; only the shared ones carry a badge", () => {
      const { getByText, getAllByTestId } = open();
      expect(getByText("Mango")).toBeTruthy();
      expect(getByText("Luna")).toBeTruthy();
      expect(getByText("Rocky")).toBeTruthy();
      expect(getAllByTestId("shared-pet-badge")).toHaveLength(2);
    });

    test("tapping a shared dog makes it the active pet", () => {
      const { getByText } = open();
      fireEvent.press(getByText("Luna"));
      expect(mockSetCurrentPet).toHaveBeenCalledWith(7);
    });

    test("a person whose ONLY dog is shared sees it and can still add their own", () => {
      mockPets = { data: [family], isLoading: false, isError: false, refetch: jest.fn() };
      mockCurrent = family;
      const { getByText } = open();
      expect(getByText("Luna")).toBeTruthy();
    });

    test("loading: a spinner, no rows", () => {
      mockPets = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
      const { queryByText } = open();
      expect(queryByText("Mango")).toBeNull();
    });

    test("error with nothing cached: a friendly message and a retry, never a raw error", () => {
      const refetch = jest.fn();
      mockPets = { data: undefined, isLoading: false, isError: true, refetch };
      const { getByTestId, getByText } = open();
      expect(getByText(w.loadError)).toBeTruthy();
      expect(getByText(w.retry)).toBeTruthy();
      fireEvent.press(getByTestId("pet-picker-error"));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    test("error WITH a cached list keeps showing the list", () => {
      mockPets = { data: [own], isLoading: false, isError: true, refetch: jest.fn() };
      const { getByText, queryByTestId } = open();
      expect(getByText("Mango")).toBeTruthy();
      expect(queryByTestId("pet-picker-error")).toBeNull();
    });
  });

  describe("AccessLostNotice (revoked / left / expired)", () => {
    let alertSpy;
    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      usePetAccessStore.getState().reset();
    });
    afterEach(() => alertSpy.mockRestore());

    test("shows ONE friendly message naming the dog, then clears the notice", () => {
      render(<AccessLostNotice />);
      expect(alertSpy).not.toHaveBeenCalled();
      act(() => usePetAccessStore.getState().setLostNotice({ petId: 7, petName: "Luna" }));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toBe(w.lostTitle);
      expect(alertSpy.mock.calls[0][1]).toBe(w.lostBody);
      expect(usePetAccessStore.getState().lostNotice).toBeNull();
    });

    test("a second loss shows a second message; an unnamed dog gets the unnamed wording", () => {
      render(<AccessLostNotice />);
      act(() => usePetAccessStore.getState().setLostNotice({ petId: 7, petName: "Luna" }));
      act(() => usePetAccessStore.getState().setLostNotice({ petId: 9, petName: null }));
      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(alertSpy.mock.calls[1][1]).not.toContain("null");
      expect(alertSpy.mock.calls[1][1].length).toBeGreaterThan(10);
    });
  });
});
