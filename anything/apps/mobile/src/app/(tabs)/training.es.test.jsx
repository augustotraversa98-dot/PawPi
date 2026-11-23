// Spanish (es-AR) proof for the DIY training curriculum: titles, summaries, difficulty badges, the
// session meta line, steps and tips all render in Spanish, while the persisted completion id is
// still built from the stable English program/session keys.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { TRAINING_PROGRAMS } from "@/data/trainingCurriculum";

let mockToggle;

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock("es"),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Services/ServicesDiscovery", () => () => null);
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
jest.mock("@/hooks/useSelfTraining", () => ({
  useSelfTrainingProgress: () => ({ completedSet: new Set() }),
  useToggleSession: () => mockToggle,
}));

import TrainingScreen from "./training";

const program = TRAINING_PROGRAMS[0];
const session = program.sessions[0];

beforeEach(() => {
  mockToggle = { mutate: jest.fn(), isPending: false };
});

test("program list renders in Spanish", () => {
  const { getByText, getAllByText } = render(<TrainingScreen />);
  expect(getByText("Lo esencial del cachorro")).toBeTruthy();
  expect(getByText("Obediencia básica")).toBeTruthy();
  expect(getAllByText("Principiante").length).toBeGreaterThan(0);
  expect(getAllByText("Intermedio").length).toBeGreaterThan(0);
  // English curated copy must not leak through.
  expect(() => getByText("Puppy Essentials")).toThrow();
  expect(() => getByText("Beginner")).toThrow();
});

test("session list, meta line, steps and tips are Spanish; the toggle id stays English-keyed", () => {
  const { getByTestId, getByText, getAllByText } = render(<TrainingScreen />);
  fireEvent.press(getByTestId(`program-${program.key}`));
  expect(getByText("1. Reconocer su nombre y la palabra marcadora")).toBeTruthy();
  expect(getAllByText("5 min · Principiante").length).toBeGreaterThan(0);
  fireEvent.press(getByTestId(`session-${session.key}`));
  expect(
    getByText("En un ambiente tranquilo, decí el nombre de tu cachorro una sola vez con tono alegre."),
  ).toBeTruthy();
  expect(
    getByText("Usá premios diminutos (del tamaño de una arveja) para poder hacer muchas repeticiones."),
  ).toBeTruthy();
  fireEvent.press(getByTestId("toggle-complete"));
  expect(mockToggle.mutate).toHaveBeenCalledWith({
    programKey: "puppy-essentials",
    sessionKey: "name-recognition",
    completed: true,
  });
});
