// Render pins for the LifeStageCard (E15): shows the effective stage + a positive behavioral tip; the
// owner override picker sets a stage; auto shows the detected note; never diagnostic copy.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockData;
let mockSetOverride;

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/hooks/useLifeStage", () => ({
  useLifeStage: () => mockData,
  useSetLifeStageOverride: () => ({ setOverride: mockSetOverride }),
}));

import { LifeStageCard } from "./LifeStageCard";

beforeEach(() => {
  mockSetOverride = jest.fn().mockResolvedValue({});
  mockData = { data: { detected: "senior", override: null, effective: "senior" } };
});

test("shows the senior stage with a gentle, non-diagnostic tip", () => {
  const { getByTestId, getByText, queryByText } = render(<LifeStageCard petId={7} petName="Rex" />);
  expect(getByTestId("life-stage-card")).toBeTruthy();
  expect(getByText("Senior stage 🦴")).toBeTruthy();
  expect(getByTestId("life-stage-tip")).toHaveTextContent(/gentle, shorter walk/);
  // Never diagnostic / never a bar it fails.
  expect(queryByText(/disease|diagnos|too old|failing/i)).toBeNull();
});

test("picking an override calls setOverride with the stage", () => {
  const { getByTestId } = render(<LifeStageCard petId={7} petName="Rex" />);
  fireEvent.press(getByTestId("life-stage-opt-adult"));
  expect(mockSetOverride).toHaveBeenCalledWith("adult");
});

test("Auto option clears the override (null)", () => {
  mockData = { data: { detected: "senior", override: "puppy", effective: "puppy" } };
  const { getByTestId } = render(<LifeStageCard petId={7} petName="Rex" />);
  fireEvent.press(getByTestId("life-stage-opt-auto"));
  expect(mockSetOverride).toHaveBeenCalledWith(null);
});

test("read-only (caregiver) hides the picker", () => {
  const { queryByTestId, getByTestId } = render(<LifeStageCard petId={7} petName="Rex" canEdit={false} />);
  expect(getByTestId("life-stage-card")).toBeTruthy();
  expect(queryByTestId("life-stage-opt-auto")).toBeNull();
});
