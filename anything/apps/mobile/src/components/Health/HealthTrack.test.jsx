// HealthTrack tracker grid: the Weight card must reach its (fully-built) modal,
// and trackers that aren't built yet show a "Soon" badge + honest feedback
// instead of a silent dead tap. Child modals + hooks are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-i18next", () => {
  const en = require("@/i18n/locales/en.json");
  const resolve = (k) =>
    k.split(".").reduce((o, part) => (o == null ? o : o[part]), en);
  return {
    useTranslation: () => ({
      t: (key, vars) => {
        let s = resolve(key);
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

// Each modal becomes a spy that records its `visible` prop so we can assert it opened.
const modalVisibility = {};
function mockModal(name) {
  return ({ visible }) => {
    modalVisibility[name] = visible;
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

// Global fetch spy: proves a coming-soon tap POSTs nothing (no log, no care-ring write).
let fetchSpy;

beforeEach(() => {
  Object.keys(modalVisibility).forEach((k) => delete modalVisibility[k]);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  fetchSpy = jest
    .spyOn(global, "fetch")
    .mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

const COMING_SOON_LABELS = TRACKERS.filter((t) => t.comingSoon).map(
  (t) => t.label,
);

test("tapping Weight opens the Weight modal (regression: it was unreachable)", () => {
  const { getByText } = render(<HealthTrack />);
  expect(modalVisibility.weight).toBe(false);
  fireEvent.press(getByText("Weight"));
  expect(modalVisibility.weight).toBe(true);
});

test("a not-yet-built tracker shows a Soon badge and gives feedback on tap", () => {
  const { getByText, getAllByText } = render(<HealthTrack />);
  // "Soon" badges are present for the unbuilt trackers.
  expect(getAllByText("Soon").length).toBeGreaterThanOrEqual(4);
  // Tapping one gives an honest coming-soon alert rather than doing nothing.
  fireEvent.press(getByText("Vital Signs"));
  expect(Alert.alert).toHaveBeenCalledWith(
    expect.stringContaining("Vital Signs"),
    expect.stringContaining("Mango"),
  );
});

// STRUCTURAL invariant: the source of the Care Ring bug was a coming-soon tile that
// could reach a write path. Assert none carry an `action` at all.
test("no coming-soon tracker carries an action (compile-time-ish invariant)", () => {
  expect(comingSoonTrackersHaveNoAction).toBe(true);
  for (const t of TRACKERS) {
    if (t.comingSoon) expect(t.action).toBeUndefined();
  }
  // There really are the four reported ones.
  expect(COMING_SOON_LABELS).toEqual(
    expect.arrayContaining([
      "Symptoms & Behavior",
      "Vital Signs",
      "Vet Visits",
      "Vaccinations",
    ]),
  );
});

// Every coming-soon tile: fires the Alert, opens NO modal, and triggers NO fetch
// (so it can never POST a log or invalidate ["care-ring"] / fill a ring segment).
test.each(COMING_SOON_LABELS)(
  "coming-soon tile %s: Alert only, no modal, no network write",
  (label) => {
    const { getByText } = render(<HealthTrack />);
    // Every logging modal starts closed.
    Object.values(modalVisibility).forEach((v) => expect(v).toBe(false));

    fireEvent.press(getByText(label));

    // Honest coming-soon feedback fired.
    expect(Alert.alert).toHaveBeenCalledWith(
      expect.stringContaining(label),
      expect.any(String),
    );
    // No logging modal ever opened.
    Object.entries(modalVisibility).forEach(([, v]) => expect(v).toBe(false));
    // Nothing was written to the network — no log POST, no care-ring touch.
    expect(fetchSpy).not.toHaveBeenCalled();
  },
);
