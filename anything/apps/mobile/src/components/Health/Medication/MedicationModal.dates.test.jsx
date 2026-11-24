// Date inputs in the Medications & Care sheet use the REAL shared DateField (the 1969 bug:
// calendar opened on Dec 1969, a picked future date jumped back to 31 Dec 1969, repeating it
// crashed). Pins the vaccine form (expiration date) and the preventive form (next due): empty
// field shows the placeholder, the picker opens on today with a valid Date, a picked date is
// saved as the same calendar day, a dismissed / epoch / invalid pick keeps the old value.

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

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
jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react");
  return { __esModule: true, default: (props) => React.createElement("DateTimePicker", props) };
});

const mockCreateVax = jest.fn().mockResolvedValue({ vaccination: { id: 1 } });
const mockCreatePrev = jest.fn().mockResolvedValue({ treatment: { id: 1 } });
jest.mock("@/hooks/usePetMedications", () => ({
  usePetMedications: () => ({ data: [], isLoading: false }),
  useCreateMedication: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateMedication: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useDeleteMedication: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock("@/hooks/usePetVaccinations", () => ({
  usePetVaccinations: () => ({ data: [], isLoading: false }),
  useCreateVaccination: () => ({ mutateAsync: mockCreateVax, isPending: false }),
  useUpdateVaccination: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteVaccination: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock("@/hooks/usePetPreventiveTreatments", () => ({
  usePetPreventiveTreatments: () => ({ data: [], isLoading: false }),
  useCreatePreventiveTreatment: () => ({ mutateAsync: mockCreatePrev, isPending: false }),
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
import { isValidDate, toCanonicalDate } from "@/utils/canonicalDateTime";

const pickers = (r) => r.UNSAFE_root.findAll((n) => n.type === "DateTimePicker");

beforeEach(() => {
  mockLocaleState.locale = "en";
  mockCreateVax.mockClear();
  mockCreatePrev.mockClear();
});

const openVaccineForm = (r) => {
  fireEvent.press(r.getByText("Vaccines"));
  fireEvent.press(r.getByText("Add vaccine"));
};

describe("vaccine form: expiration date", () => {
  it("starts empty with a placeholder, opens on today with a valid Date", () => {
    const r = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    openVaccineForm(r);
    expect(r.getAllByText("Select date")).toHaveLength(2); // date given + expiration
    expect(pickers(r)).toHaveLength(0);

    fireEvent.press(r.getAllByText("Select date")[1]); // expiration
    const [picker] = pickers(r);
    expect(isValidDate(picker.props.value)).toBe(true);
    expect(toCanonicalDate(picker.props.value)).toBe(toCanonicalDate(new Date()));
  });

  it("a picked future date is saved as the same calendar day", async () => {
    const r = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    openVaccineForm(r);
    fireEvent.changeText(r.getByPlaceholderText("e.g., Rabies, DHPP"), "Rabies");
    fireEvent.press(r.getAllByText("Select date")[1]);
    act(() => pickers(r)[0].props.onChange({ type: "set" }, new Date(2030, 10, 30, 23, 30)));
    expect(r.getByText("30 November 2030")).toBeTruthy();
    fireEvent.press(r.getByText("Save"));
    await waitFor(() =>
      expect(mockCreateVax).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Rabies", expiresOn: "2030-11-30", dateGiven: null }),
      ),
    );
  });

  it("dismiss / empty / epoch / invalid picks keep the field empty and save no date", async () => {
    const r = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    openVaccineForm(r);
    fireEvent.changeText(r.getByPlaceholderText("e.g., Rabies, DHPP"), "Rabies");
    for (const [event, date] of [
      [{ type: "dismissed" }, undefined],
      [{ type: "set" }, undefined],
      [{ type: "set" }, new Date(0)],
      [{ type: "set" }, new Date(NaN)],
    ]) {
      fireEvent.press(r.getAllByText("Select date")[1]);
      act(() => pickers(r)[0].props.onChange(event, date));
    }
    expect(r.getAllByText("Select date")).toHaveLength(2);
    expect(r.queryByText(/1969|1970/)).toBeNull();
    fireEvent.press(r.getByText("Save"));
    await waitFor(() =>
      expect(mockCreateVax).toHaveBeenCalledWith(expect.objectContaining({ expiresOn: null })),
    );
  });

  it("opening and picking repeatedly never throws", () => {
    const r = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    openVaccineForm(r);
    for (let i = 0; i < 4; i++) {
      fireEvent.press(r.getAllByText(/Select date|\d{4}/)[1]);
      act(() => pickers(r)[0].props.onChange({ type: "set" }, new Date(2031, 0, 10 + i)));
    }
    expect(r.getByText("13 January 2031")).toBeTruthy();
  });
});

describe("preventive form: next due date", () => {
  it("opens on today and saves a picked date unchanged", async () => {
    const r = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    fireEvent.press(r.getByText("Preventive"));
    fireEvent.press(r.getByText("Add preventive care"));
    fireEvent.changeText(r.getByPlaceholderText("e.g., Simparica Trio"), "Simparica");
    // last given + next due placeholders
    expect(r.getAllByText("Select date")).toHaveLength(2);
    fireEvent.press(r.getAllByText("Select date")[1]);
    const [picker] = pickers(r);
    expect(isValidDate(picker.props.value)).toBe(true);
    expect(toCanonicalDate(picker.props.value)).toBe(toCanonicalDate(new Date()));
    act(() => picker.props.onChange({ type: "set" }, new Date(2027, 0, 1, 0, 0)));
    expect(r.getByText("1 January 2027")).toBeTruthy();
    fireEvent.press(r.getByText("Save"));
    await waitFor(() =>
      expect(mockCreatePrev).toHaveBeenCalledWith(
        expect.objectContaining({ productName: "Simparica", nextDue: "2027-01-01", lastGiven: null }),
      ),
    );
  });

  it("Spanish: placeholder is localized and a dismissed pick leaves it empty", () => {
    mockLocaleState.locale = "es";
    const r = render(<MedicationModal visible onClose={jest.fn()} petId={7} />);
    fireEvent.press(r.getByText("Preventivos"));
    fireEvent.press(r.getByText("Agregar cuidado preventivo"));
    const placeholders = r.getAllByText("Elegí una fecha");
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
    fireEvent.press(placeholders[1]);
    act(() => pickers(r)[0].props.onChange({ type: "dismissed" }, undefined));
    expect(r.getAllByText("Elegí una fecha").length).toBe(placeholders.length);
  });
});
