// HealthTrack is a two-section tracker grid (Everyday · Health records). This suite
// pins the consolidated tile set, the full EN+ES localization, the wiring of the
// records tiles (Medications & Care → medication modal), and the Care Ring integrity
// invariant. After the 2026-08-18 on-device revision there are NO coming-soon tiles
// left — every tile opens a real logging surface — so the invariant now holds
// vacuously and the screen can never carry a display-only tile that reaches a write
// path. Child modals + hooks are mocked.

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
// initialTab) so we can assert what opened and how it was wired.
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

import HealthTrack, {
  TRACKERS,
  comingSoonTrackersHaveNoAction,
} from "./HealthTrack";

// Global fetch spy: proves the screen POSTs nothing on its own (no stray care-ring write).
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

test("renders both sections and the consolidated 7-tile set (EN)", () => {
  const { getByText, queryAllByText } = render(<HealthTrack />);
  // Section headers.
  expect(getByText("Everyday")).toBeTruthy();
  expect(getByText("Health records")).toBeTruthy();
  // Everyday tiles.
  expect(getByText("Food & Water")).toBeTruthy();
  expect(getByText("Bathroom & Digestion")).toBeTruthy();
  expect(getByText("Walk & Activity")).toBeTruthy();
  expect(getByText("Weight")).toBeTruthy();
  expect(getByText("Quick Check")).toBeTruthy();
  // Health-records tiles (Vaccines folded into Medications & Care; Vet Visits and
  // Vital Signs removed entirely).
  expect(getByText("Medications & Care")).toBeTruthy();
  expect(getByText("Photo Check")).toBeTruthy();
  // Removed tiles are gone.
  expect(queryAllByText("Vaccines")).toHaveLength(0);
  expect(queryAllByText("Vet Visits")).toHaveLength(0);
  expect(queryAllByText("Vital Signs")).toHaveLength(0);
  // No "Soon" badge remains anywhere.
  expect(queryAllByText("Soon")).toHaveLength(0);
});

test("renders fully localized in Spanish (es-AR)", () => {
  mockLocaleState.locale = "es";
  const { getByText, queryAllByText } = render(<HealthTrack />);
  expect(getByText("Cotidiano")).toBeTruthy();
  expect(getByText("Historia clínica")).toBeTruthy();
  expect(getByText("Comida y agua")).toBeTruthy();
  expect(getByText("Baño y digestión")).toBeTruthy();
  expect(getByText("Chequeo rápido")).toBeTruthy();
  expect(getByText("Medicación y cuidados")).toBeTruthy();
  expect(getByText("Chequeo con fotos")).toBeTruthy();
  // Removed tiles are gone in ES too.
  expect(queryAllByText("Vacunas")).toHaveLength(0);
  expect(queryAllByText("Visitas al veterinario")).toHaveLength(0);
  expect(queryAllByText("Signos vitales")).toHaveLength(0);
  // No localized "Soon" badge either.
  expect(queryAllByText("Pronto")).toHaveLength(0);
});

test("tapping Weight opens the Weight modal", () => {
  const { getByText } = render(<HealthTrack />);
  expect(modalVisibility.weight).toBe(false);
  fireEvent.press(getByText("Weight"));
  expect(modalVisibility.weight).toBe(true);
});

test("Medications & Care opens the medication modal on the medications tab", () => {
  const { getByText } = render(<HealthTrack />);
  fireEvent.press(getByText("Medications & Care"));
  expect(modalVisibility.medication).toBe(true);
  expect(modalProps.medication.initialTab).toBe("medications");
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
// could reach a write path. There are now zero coming-soon tiles, so the invariant
// holds vacuously — assert both that it holds and that no tile is display-only.
test("no coming-soon tracker exists or carries an action (Care Ring integrity)", () => {
  expect(comingSoonTrackersHaveNoAction).toBe(true);
  for (const tr of TRACKERS) {
    if (tr.comingSoon) expect(tr.action).toBeUndefined();
  }
  const comingSoon = TRACKERS.filter((tr) => tr.comingSoon).map((tr) => tr.id);
  expect(comingSoon).toEqual([]);
  // Every remaining tile carries a real action (nothing display-only left).
  expect(TRACKERS.every((tr) => typeof tr.action === "string")).toBe(true);
});

// Rendering the screen and opening tiles must never POST on its own — only the child
// logging modals write, and only on explicit save (they are mocked here).
test("rendering the Track screen triggers no network write", () => {
  render(<HealthTrack />);
  expect(fetchSpy).not.toHaveBeenCalled();
});
