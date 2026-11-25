// The "Remind me about this dog" switches in Reminder settings, EN + ES.
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import i18n from "@/i18n";

const mockLoad = jest.fn(async () => []);
const mockSync = jest.fn(async () => {});
let mockPets;
jest.mock("@/hooks/usePetProfile", () => ({
  usePetProfile: () => ({ data: mockPets }),
  useCurrentPet: () => ({ data: mockPets?.[0] }),
}));
jest.mock("@/store/routinesStore", () => ({
  __esModule: true,
  default: { getState: () => ({ loadRoutines: mockLoad }) },
}));
jest.mock("@/store/remindersStore", () => ({
  __esModule: true,
  default: { getState: () => ({ syncAlarms: mockSync }) },
}));
jest.mock("@/utils/auth/store", () => {
  const state = { auth: { user: { id: 1 } } };
  const useAuthStore = (selector) => selector(state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});
jest.mock("lucide-react-native", () => ({ Users: () => null }));

import DogReminderSwitches from "./DogReminderSwitches";
import useReminderMuteStore from "@/store/reminderMuteStore";

const MANGO = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const LUNA = { id: 7, name: "Luna", is_shared: true, access_role: "caregiver", owner_display: { full_name: "Sam" } };

beforeEach(async () => {
  mockPets = [MANGO, LUNA];
  mockLoad.mockClear();
  mockSync.mockClear();
  useReminderMuteStore.setState({ mutedByUser: {} });
  await i18n.changeLanguage("en");
});

test("one switch per dog, on by default, with the shared badge", () => {
  const screen = render(<DogReminderSwitches />);
  expect(screen.getByText("Remind me about Mango")).toBeTruthy();
  expect(screen.getByText("Remind me about Luna")).toBeTruthy();
  expect(screen.getByTestId("dog-reminder-switch-7").props.value).toBe(true);
  expect(screen.getByTestId("shared-pet-badge")).toBeTruthy();
});

test("off stores the choice, explains it and re-runs the alarm pass", async () => {
  const screen = render(<DogReminderSwitches />);
  await act(async () => fireEvent(screen.getByTestId("dog-reminder-switch-7"), "valueChange", false));
  expect(useReminderMuteStore.getState().mutedByUser).toEqual({ 1: ["7"] });
  expect(screen.getByText("No reminder alerts on this phone. Today still lists everything.")).toBeTruthy();
  expect(mockSync).toHaveBeenCalled();
  expect(mockLoad).not.toHaveBeenCalled();
});

test("on again reads the dog (in the background when it is not the selected one) and re-arms", async () => {
  useReminderMuteStore.setState({ mutedByUser: { 1: ["7"] } });
  const screen = render(<DogReminderSwitches />);
  await act(async () => fireEvent(screen.getByTestId("dog-reminder-switch-7"), "valueChange", true));
  expect(mockLoad).toHaveBeenCalledWith(7, { background: true });
  expect(mockSync).toHaveBeenCalled();
  expect(useReminderMuteStore.getState().mutedByUser).toEqual({ 1: [] });
});

test("Spanish (voseo)", async () => {
  await i18n.changeLanguage("es");
  const screen = render(<DogReminderSwitches />);
  expect(screen.getByText("Avisame sobre Luna")).toBeTruthy();
  expect(screen.getByText("De qué perros te avisamos")).toBeTruthy();
});

test("nothing to show without a dog", () => {
  mockPets = [];
  expect(render(<DogReminderSwitches />).toJSON()).toBeNull();
});
