// HealthTrack tracker grid: the Weight card must reach its (fully-built) modal,
// and trackers that aren't built yet show a "Soon" badge + honest feedback
// instead of a silent dead tap. Child modals + hooks are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
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

import HealthTrack from "./HealthTrack";

beforeEach(() => {
  Object.keys(modalVisibility).forEach((k) => delete modalVisibility[k]);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

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
