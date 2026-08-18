// HealthTrack is a two-section tracker grid (Everyday · Health records). This suite
// pins the consolidated tile set, the full EN+ES localization, the real wiring of the
// once-"Soon" tiles (Vaccines → medication vaccines tab, Vet Visits → vet-record note
// flow), and the Care Ring integrity invariant: the ONLY remaining coming-soon tile
// (Vital Signs) is display-only — Alert, no modal, no network write. Child modals +
// hooks are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);

// Locale is switchable so we can assert the same screen renders in EN and ES.
const mockLocaleState = { locale: "en" };
jest.mock("react-i18next", () => {
  const dicts = {
    en: require("@/i18n/locales/en.json"),
    es: require("@/i18n/locales/es.json"),
  };
  const resolve = (dict, k) =>
    k.split(".").reduce((o, part) => (o == null ? o : o[part]), dict);
  return {
    useTranslation: () => ({
      t: (key, vars) => {
        let s = resolve(dicts[mockLocaleState.locale], key);
        if (typeof s !== "string") return key;
        if (vars)
          for (const [name, val] of Object.entries(vars))
            s = s.replace(new RegExp(`{{${name}}}`, "g"), String(val));
        return s;
      },
    }),
  };
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Mango" } }),
}));

// Each modal becomes a spy that records the props it was rendered with (visible + any
// initialTab / petId) so we can assert what opened and how it was wired.
const modalVisibility = {};
const modalProps = {};
function mockModal(name) {
  return (props) => {
    modalVisibility[name] = props.visible;
    modalProps[name] = props;
    return null;
  };
}
jest.mock("./PhotoCheck/PhotoCheckModal", () => mockModal("photoCheck"));
jest.mock("./FoodWater/FoodWaterTrackerModal", () => mockModal("foodWater"));
jest.mock("./Poo/PooTrackerModal", () => mockModal("poo"));
jest.mock("./Pee/PeeTrackerModal", () => mockModal("pee"));
jest.mock("./Vomit/VomitTrackerModal", () => mockModal("vomit"));
jest.mock("./WalkActivity/WalkActivityModal", () => mockModal("walk"));
jest.mock("./GeneralCheck/GeneralCheckModal", () => mockModal("general"));
jest.mock("./Medication/MedicationModal", () => mockModal("medication"));
jest.mock("./Weight/WeightModal", () => mockModal("weight"));
jest.mock("./VetRecord/AddVetNoteModal", () => ({
  AddVetNoteModal: mockModal("vetNote"),
}));

import HealthTrack, {
  TRACKERS,
  comingSoonTrackersHaveNoAction,
} from "./HealthTrack";

// Global fetch spy: proves a coming-soon tap POSTs nothing (no log, no care-ring write).
let fetchSpy;

beforeEach(() => {
  mockLocaleState.locale = "en";
  Object.keys(modalVisibility).forEach((k) => delete modalVisibility[k]);
  Object.keys(modalProps).forEach((k) => delete modalProps[k]);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  fetchSpy = jest
    .spyOn(global, "fetch")
    .mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

const COMING_SOON_LABELS_EN = ["Vital Signs"];

test("renders both sections and the consolidated 9-tile set (EN)", () => {
  const { getByText, getAllByText } = render(<HealthTrack />);
  // Section headers.
  expect(getByText("Everyday")).toBeTruthy();
  expect(getByText("Health records")).toBeTruthy();
  // Everyday tiles.
  expect(getByText("Food & Water")).toBeTruthy();
  expect(getByText("Bathroom & Digestion")).toBeTruthy();
  expect(getByText("Walk & Activity")).toBeTruthy();
  expect(getByText("Weight")).toBeTruthy();
  expect(getByText("Quick Check")).toBeTruthy();
  // Health-records tiles.
  expect(getByText("Medications & Care")).toBeTruthy();
  expect(getByText("Vaccines")).toBeTruthy();
  expect(getByText("Vet Visits")).toBeTruthy();
  expect(getByText("Photo Check")).toBeTruthy();
  expect(getByText("Vital Signs")).toBeTruthy();
  // Exactly ONE "Soon" badge remains (Vital Signs).
  expect(getAllByText("Soon")).toHaveLength(1);
});

test("renders fully localized in Spanish (es-AR)", () => {
  mockLocaleState.locale = "es";
  const { getByText, getAllByText } = render(<HealthTrack />);
  expect(getByText("Cotidiano")).toBeTruthy();
  expect(getByText("Historia clínica")).toBeTruthy();
  expect(getByText("Comida y agua")).toBeTruthy();
  expect(getByText("Baño y digestión")).toBeTruthy();
  expect(getByText("Chequeo rápido")).toBeTruthy();
  expect(getByText("Vacunas")).toBeTruthy();
  expect(getByText("Visitas al veterinario")).toBeTruthy();
  expect(getByText("Signos vitales")).toBeTruthy();
  // The Soon badge is localized too.
  expect(getAllByText("Pronto")).toHaveLength(1);
});

test("tapping Weight opens the Weight modal", () => {
  const { getByText } = render(<HealthTrack />);
  expect(modalVisibility.weight).toBe(false);
  fireEvent.press(getByText("Weight"));
  expect(modalVisibility.weight).toBe(true);
});

test("Vaccines opens the medication modal on the vaccines tab (made real)", () => {
  const { getByText } = render(<HealthTrack />);
  fireEvent.press(getByText("Vaccines"));
  expect(modalVisibility.medication).toBe(true);
  expect(modalProps.medication.initialTab).toBe("vaccines");
});

test("Medications & Care opens the medication modal on the medications tab", () => {
  const { getByText } = render(<HealthTrack />);
  fireEvent.press(getByText("Medications & Care"));
  expect(modalVisibility.medication).toBe(true);
  expect(modalProps.medication.initialTab).toBe("medications");
});

test("Vet Visits opens the real vet-record note flow, scoped to the pet", () => {
  const { getByText } = render(<HealthTrack />);
  expect(modalVisibility.vetNote).toBe(false);
  fireEvent.press(getByText("Vet Visits"));
  // Opens AddVetNoteModal (POSTs to /api/vet-record/notes) wired to the current pet.
  expect(modalVisibility.vetNote).toBe(true);
  expect(modalProps.vetNote.petId).toBe(1);
});

test("Bathroom & Digestion folds pee/poo/vomit behind one chooser", () => {
  const { getByText } = render(<HealthTrack />);
  expect(modalVisibility.pee).toBe(false);
  fireEvent.press(getByText("Bathroom & Digestion"));
  // Chooser is shown; picking Pee opens the (already-persisting) pee modal.
  fireEvent.press(getByText("Pee"));
  expect(modalVisibility.pee).toBe(true);
});

// STRUCTURAL invariant: the source of the Care Ring bug was a coming-soon tile that
// could reach a write path. Assert none carry an `action` at all, and that Vital Signs
// is the only one left.
test("no coming-soon tracker carries an action (compile-time-ish invariant)", () => {
  expect(comingSoonTrackersHaveNoAction).toBe(true);
  for (const tr of TRACKERS) {
    if (tr.comingSoon) expect(tr.action).toBeUndefined();
  }
  const comingSoon = TRACKERS.filter((tr) => tr.comingSoon).map((tr) => tr.id);
  expect(comingSoon).toEqual(["vitalSigns"]);
});

// The only coming-soon tile: fires the Alert, opens NO modal, and triggers NO fetch or
// log mutation (so it can never fill a Care Ring segment / invalidate ["care-ring"]).
test.each(COMING_SOON_LABELS_EN)(
  "coming-soon tile %s: Alert only, no modal, no network write",
  (label) => {
    const { getByText } = render(<HealthTrack />);
    Object.values(modalVisibility).forEach((v) => expect(v).toBe(false));

    fireEvent.press(getByText(label));

    // Honest coming-soon feedback fired (title has the label, body names the pet).
    expect(Alert.alert).toHaveBeenCalledWith(
      expect.stringContaining(label),
      expect.stringContaining("Mango"),
    );
    // No logging modal ever opened.
    Object.values(modalVisibility).forEach((v) => expect(v).toBe(false));
    // Nothing was written to the network — no log POST, no care-ring touch.
    expect(fetchSpy).not.toHaveBeenCalled();
  },
);
