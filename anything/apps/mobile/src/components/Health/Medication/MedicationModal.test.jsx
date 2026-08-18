// MedicationModal (NR4) — the Medications & Care sheet is now REAL: per-pet data via
// react-query hooks, no mock seed. This suite pins: empty states when a pet has nothing,
// that Add → Save calls the real create mutation with the typed values (persist path),
// and that the sheet is fully localized (EN + ES).

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const React = require("react");
  const { View } = require("react-native");
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollTo: () => {} }));
    return <View {...props} />;
  });
});
jest.mock("@/components/DateField", () => () => null);

const mockCreateMed = jest.fn().mockResolvedValue({ medication: { id: 1 } });
jest.mock("@/hooks/usePetMedications", () => ({
  usePetMedications: () => ({ data: [], isLoading: false }),
  useCreateMedication: () => ({ mutateAsync: mockCreateMed, isPending: false }),
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

const mockLocaleState = { locale: "en" };
jest.mock("react-i18next", () => {
  const dicts = {
    en: require("@/i18n/locales/en.json"),
    es: require("@/i18n/locales/es.json"),
  };
  const resolve = (dict, k) => k.split(".").reduce((o, part) => (o == null ? o : o[part]), dict);
  return {
    useTranslation: () => ({
      t: (key, vars) => {
        let s = resolve(dicts[mockLocaleState.locale], key);
        if (typeof s !== "string") return key;
        if (vars) for (const [n, v] of Object.entries(vars)) s = s.replace(new RegExp(`{{${n}}}`, "g"), String(v));
        return s;
      },
    }),
  };
});

import MedicationModal from "./MedicationModal";

beforeEach(() => {
  mockLocaleState.locale = "en";
  mockCreateMed.mockClear();
});

test("shows the empty state when the pet has no medications (no seed)", () => {
  const { getByText } = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
  expect(getByText("No medications added yet")).toBeTruthy();
  // The old mock seed names must be gone.
  expect(() => getByText("Carprofen")).toThrow();
  expect(() => getByText("Enalapril")).toThrow();
});

test("Add → Save persists via the real create mutation with the typed values", async () => {
  const { getByText, getByPlaceholderText } = render(
    <MedicationModal visible onClose={jest.fn()} petId={7} />,
  );

  fireEvent.press(getByText("Add medication"));
  fireEvent.changeText(getByPlaceholderText("e.g., Carprofen"), "Meloxicam");
  fireEvent.changeText(getByPlaceholderText("e.g., 25 mg"), "1.5 mg");
  fireEvent.press(getByText("Save"));

  await waitFor(() =>
    expect(mockCreateMed).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Meloxicam", dose: "1.5 mg" }),
    ),
  );
});

test("empty states localize across all three tabs (ES)", () => {
  mockLocaleState.locale = "es";
  const { getByText } = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
  expect(getByText("Medicamentos y cuidados")).toBeTruthy();
  expect(getByText("Agregar medicamento")).toBeTruthy();
  expect(getByText("Todavía no agregaste medicamentos")).toBeTruthy();

  // Vaccines tab
  fireEvent.press(getByText("Vacunas"));
  expect(getByText("Todavía no agregaste vacunas")).toBeTruthy();

  // Preventives tab
  fireEvent.press(getByText("Preventivos"));
  expect(getByText("Todavía no agregaste cuidados preventivos")).toBeTruthy();
});
