// Render pins for the DIY self-training curriculum (ticket 2.45):
//   - real programs render (no TRAINING_LESSONS mock);
//   - per-pet progress count reflects completed sessions;
//   - opening a program → session → detail and tapping "Mark as completed" fires the toggle;
//   - the "Want a pro?" banner still links to the provider training service.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { completionId, TRAINING_PROGRAMS } from "@/data/trainingCurriculum";

let mockPush;
let mockCompletedSet;
let mockToggle;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
jest.mock("@/hooks/useSelfTraining", () => ({
  useSelfTrainingProgress: () => ({ completedSet: mockCompletedSet }),
  useToggleSession: () => mockToggle,
}));

import TrainingScreen from "./training";

const firstProgram = TRAINING_PROGRAMS[0];
const firstSession = firstProgram.sessions[0];

beforeEach(() => {
  mockPush = jest.fn();
  mockCompletedSet = new Set();
  mockToggle = { mutate: jest.fn(), isPending: false };
});

test("TRAINING_LESSONS mock has been removed from mockData", () => {
  const mockData = require("@/data/mockData");
  expect(mockData.TRAINING_LESSONS).toBeUndefined();
});

test("renders real curriculum programs", () => {
  const { getByText } = render(<TrainingScreen />);
  expect(getByText(new RegExp(firstProgram.title))).toBeTruthy();
  expect(getByText(/of .* sessions completed across/)).toBeTruthy();
});

test("per-pet progress count reflects the completed set", () => {
  mockCompletedSet = new Set([completionId(firstProgram.key, firstSession.key)]);
  const { getByTestId } = render(<TrainingScreen />);
  expect(getByTestId(`program-progress-${firstProgram.key}`).props.children).toEqual([
    1,
    " of ",
    firstProgram.sessions.length,
    " sessions done",
  ]);
});

test("opening a program → session → mark complete fires the toggle", () => {
  const { getByTestId } = render(<TrainingScreen />);
  fireEvent.press(getByTestId(`program-${firstProgram.key}`));
  fireEvent.press(getByTestId(`session-${firstSession.key}`));
  fireEvent.press(getByTestId("toggle-complete"));
  expect(mockToggle.mutate).toHaveBeenCalledWith({
    programKey: firstProgram.key,
    sessionKey: firstSession.key,
    completed: true,
  });
});

test("a completed session toggles back to incomplete", () => {
  mockCompletedSet = new Set([completionId(firstProgram.key, firstSession.key)]);
  const { getByTestId } = render(<TrainingScreen />);
  fireEvent.press(getByTestId(`program-${firstProgram.key}`));
  fireEvent.press(getByTestId(`session-${firstSession.key}`));
  fireEvent.press(getByTestId("toggle-complete"));
  expect(mockToggle.mutate).toHaveBeenCalledWith({
    programKey: firstProgram.key,
    sessionKey: firstSession.key,
    completed: false,
  });
});

test("the 'Want a pro?' banner links to the provider training service", () => {
  const { getByTestId } = render(<TrainingScreen />);
  fireEvent.press(getByTestId("hire-trainer-banner"));
  expect(mockPush).toHaveBeenCalledWith("/service/training");
});
