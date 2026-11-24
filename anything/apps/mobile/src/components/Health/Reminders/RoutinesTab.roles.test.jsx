// Family sharing (PR5a): the Routines tab by role. A caregiver on a shared dog SEES the routines (feeding, meds) but cannot create, pause, edit
// or delete them; owner and family can. EN + ES.
import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockPet;
let mockRoutines;
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "en").useTranslation(),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockPet, isLoading: false }),
}));
jest.mock("@/hooks/useBottomClearance", () => () => 0);
jest.mock("@/hooks/useSingleFlight", () => (fn) => fn);
jest.mock("@/components/RefreshableScrollView", () => {
  const { ScrollView } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <ScrollView>{children}</ScrollView> };
});
jest.mock("@/telemetry/track", () => ({ trackFunnel: jest.fn(), trackFeature: jest.fn(), trackTap: jest.fn() }));
jest.mock("@/telemetry/useFormTelemetry", () => ({
  useFormTelemetry: () => ({ markComplete: jest.fn(), markError: jest.fn() }),
}));
jest.mock("@/store/routinesStore", () => ({
  __esModule: true,
  default: () => ({
    routines: mockRoutines,
    addRoutine: jest.fn(),
    updateRoutine: jest.fn(),
    deleteRoutine: jest.fn(),
    toggleRoutineActive: jest.fn(),
    loadRoutines: jest.fn(),
    loading: false,
  }),
}));

import RoutinesTab from "./RoutinesTab";
import RoutineCard from "./RoutineCard";

const feeding = {
  id: "r1", type: "feeding", petId: 7, petName: "Luna", isActive: true, title: "Meals",
  meals: [{ id: "m1", time: "08:00", frequency: "daily", reminderEnabled: true }],
};
const owner = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const family = { id: 7, name: "Luna", is_shared: true, access_role: "family" };
const caregiver = { id: 7, name: "Luna", is_shared: true, access_role: "caregiver" };

const W = {
  en: { edit: "Edit Routine", del: "Delete Routine", first: "Create First Routine", hint: "Only the owner and family can change this." },
  es: { edit: "Editar rutina", del: "Eliminar rutina", first: "Crear la primera rutina", hint: "Solo el dueño y la familia pueden cambiar esto." },
};

const mount = (ui) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe.each(["en", "es"])("RoutinesTab by role (%s)", (lang) => {
  const w = W[lang];
  beforeEach(() => {
    global.__lang = lang;
    mockRoutines = [feeding];
  });
  afterAll(() => {
    delete global.__lang;
  });

  test.each([
    ["owner", owner],
    ["family", family],
  ])("%s: sees the routine WITH edit and delete", (_n, pet) => {
    mockPet = pet;
    const { getByText, queryByTestId } = mount(<RoutinesTab />);
    expect(getByText(w.edit)).toBeTruthy();
    expect(getByText(w.del)).toBeTruthy();
    expect(queryByTestId("routines-read-only-hint")).toBeNull();
  });

  test("caregiver: sees the routine but there is NO edit, NO delete (and no pause switch)", () => {
    mockPet = caregiver;
    const { queryByText, UNSAFE_queryAllByType } = mount(<RoutinesTab />);
    expect(queryByText(w.edit)).toBeNull();
    expect(queryByText(w.del)).toBeNull();
    const { Switch } = require("react-native");
    expect(UNSAFE_queryAllByType(Switch)).toHaveLength(0);
  });

  test("caregiver with NO routines yet: a plain read-only note, not a 'create first routine' button", () => {
    mockPet = caregiver;
    mockRoutines = [];
    const { queryByText, getByTestId, getByText } = mount(<RoutinesTab />);
    expect(queryByText(w.first)).toBeNull();
    expect(getByTestId("routines-read-only-hint")).toBeTruthy();
    expect(getByText(w.hint)).toBeTruthy();
  });

  test("family with no routines yet CAN create the first one", () => {
    mockPet = family;
    mockRoutines = [];
    const { getByText } = mount(<RoutinesTab />);
    expect(getByText(w.first)).toBeTruthy();
  });
});

describe("RoutineCard readOnly", () => {
  beforeEach(() => {
    global.__lang = "en";
  });
  afterAll(() => {
    delete global.__lang;
  });
  test("default (editable) keeps the pause switch, edit and delete; readOnly drops all three", () => {
    const { Switch } = require("react-native");
    const editable = render(<RoutineCard routine={feeding} onEdit={jest.fn()} onToggle={jest.fn()} onDelete={jest.fn()} />);
    expect(editable.UNSAFE_queryAllByType(Switch)).toHaveLength(1);
    expect(editable.getByText("Edit Routine")).toBeTruthy();
    editable.unmount();
    const ro = render(<RoutineCard routine={feeding} readOnly onEdit={jest.fn()} onToggle={jest.fn()} onDelete={jest.fn()} />);
    expect(ro.UNSAFE_queryAllByType(Switch)).toHaveLength(0);
    expect(ro.queryByText("Edit Routine")).toBeNull();
    expect(ro.queryByText("Delete Routine")).toBeNull();
  });
});
