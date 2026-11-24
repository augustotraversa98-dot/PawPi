// Family sharing (PR5a): the Medications & care sheet by role. Owner and family can add / edit / delete; a caregiver on a shared dog sees the
// medications and preventive care read-only and has NO vaccines tab (the server keeps vaccines closed to caregivers). EN + ES.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockPet;
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const React = require("react");
  const { View } = require("react-native");
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollTo: () => {} }));
    return <View {...props} />;
  });
});
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: mockPet, isLoading: false }) }));
jest.mock("@/hooks/usePetMedications", () => ({
  usePetMedications: () => ({
    data: [{ id: 1, name: "Carprofen", dose: "25 mg", status: "active", frequency: "daily" }],
    isLoading: false,
  }),
  useCreateMedication: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateMedication: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useDeleteMedication: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock("@/hooks/usePetVaccinations", () => ({
  usePetVaccinations: () => ({ data: [], isLoading: false }),
  useCreateVaccination: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateVaccination: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteVaccination: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock("@/hooks/usePetPreventiveTreatments", () => ({
  usePetPreventiveTreatments: () => ({ data: [], isLoading: false }),
  useCreatePreventiveTreatment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePreventiveTreatment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeletePreventiveTreatment: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "en").useTranslation(),
}));

import MedicationModal from "./MedicationModal";

const owner = { id: 7, name: "Luna", is_shared: false, access_role: "owner" };
const family = { id: 7, name: "Luna", is_shared: true, access_role: "family" };
const caregiver = { id: 7, name: "Luna", is_shared: true, access_role: "caregiver" };

const W = {
  en: { add: "Add medication", vaccines: "Vaccines", preventives: "Preventive", edit: "Edit" },
  es: { add: "Agregar medicamento", vaccines: "Vacunas", preventives: "Preventivos", edit: "Editar" },
};

describe.each(["en", "es"])("MedicationModal by role (%s)", (lang) => {
  const w = W[lang];
  beforeEach(() => {
    global.__lang = lang;
  });
  afterAll(() => {
    delete global.__lang;
  });

  test.each([
    ["owner", owner],
    ["family", family],
  ])("%s: can add, sees all three tabs", (_n, pet) => {
    mockPet = pet;
    const { getByText, getByLabelText } = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    expect(getByText("Carprofen")).toBeTruthy();
    expect(getByLabelText(w.edit)).toBeTruthy(); // the control the caregiver must NOT get exists for owner / family
    expect(getByText(w.add)).toBeTruthy();
    expect(getByText(w.vaccines)).toBeTruthy();
    expect(getByText(w.preventives)).toBeTruthy();
  });

  test("caregiver: sees the medication but cannot add / edit / delete it, and has no vaccines tab", () => {
    mockPet = caregiver;
    const { getByText, queryByText, queryByLabelText } = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    expect(getByText("Carprofen")).toBeTruthy();
    expect(queryByText(w.add)).toBeNull();
    expect(queryByText(w.vaccines)).toBeNull();
    expect(getByText(w.preventives)).toBeTruthy();
    expect(queryByLabelText(w.edit)).toBeNull();
  });

  test("the preventives tab stays readable for a caregiver", () => {
    mockPet = caregiver;
    const { getByText, queryByText } = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    fireEvent.press(getByText(w.preventives));
    expect(queryByText(w.add)).toBeNull();
  });
});
