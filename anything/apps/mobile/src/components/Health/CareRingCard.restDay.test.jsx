// Rest day asks before turning ON (it used to be a silent one-tap link); turning it OFF does not ask. EN + ES.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/Health/CareRing", () => ({ CareRing: () => null }));
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/ui/Card", () => {
  const { View } = require("react-native");
  return { Card: ({ children }) => <View>{children}</View> };
});
jest.mock("@/utils/engagementNotifications", () => ({ maybeScheduleStreakSave: () => Promise.resolve() }));
jest.mock("@/components/Health/GeneralCheck/GeneralCheckModal", () => () => null);
jest.mock("@/components/Health/WalkActivity/WalkActivityModal", () => () => null);
jest.mock("@/hooks/useFetchHealthData", () => ({ useGeneralChecks: () => ({ data: { checks: [] } }) }));
jest.mock("@/hooks/useHealthReinforcement", () => ({
  useDeleteGeneralCheck: () => ({ mutateAsync: jest.fn() }),
}));

let mockRing;
const mockSetRest = jest.fn();
jest.mock("@/hooks/useCareRing", () => ({
  useCareRing: () => ({ data: mockRing }),
  useSetRestDay: () => ({ mutate: mockSetRest }),
  useSetPause: () => ({ mutate: jest.fn() }),
  useRepairStreak: () => ({ mutate: jest.fn() }),
  careRingKey: (id) => ["care-ring", id],
}));

let mockLocale = "en";
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, vars) => {
      const dict =
        mockLocale === "es" ? require("@/i18n/locales/es.json") : require("@/i18n/locales/en.json");
      const val = key.split(".").reduce((o, p) => (o == null ? o : o[p]), dict);
      if (typeof val !== "string") return key;
      return vars ? val.replace(/\{\{(\w+)\}\}/g, (_, n) => String(vars[n] ?? "")) : val;
    },
  }),
}));

import { CareRingCard } from "./CareRingCard";

const base = { walk_done: false, moment_done: false, care_done: false, ring_closed: false, rest_day: false, paused: false };
let alertSpy;
beforeEach(() => {
  mockLocale = "en";
  mockRing = { ...base };
  mockSetRest.mockClear();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const buttons = () => alertSpy.mock.calls[0][2];

test("tapping the link only asks; nothing is saved yet", () => {
  const screen = render(<CareRingCard petId={7} petName="Mango" />);
  fireEvent.press(screen.getByText("Taking a rest day?"));
  expect(mockSetRest).not.toHaveBeenCalled();
  const [title, body] = alertSpy.mock.calls[0];
  expect(title).toBe("Rest day for Mango?");
  expect(body).toContain("streak stays safe");
  expect(buttons().map((b) => b.text)).toEqual(["Not today", "Yes, rest day"]);
});

test("cancelling saves nothing", () => {
  const screen = render(<CareRingCard petId={7} petName="Mango" />);
  fireEvent.press(screen.getByText("Taking a rest day?"));
  expect(buttons()[0].style).toBe("cancel");
  buttons()[0].onPress?.();
  expect(mockSetRest).not.toHaveBeenCalled();
});

test("confirming turns the rest day on", () => {
  const screen = render(<CareRingCard petId={7} petName="Mango" />);
  fireEvent.press(screen.getByText("Taking a rest day?"));
  buttons()[1].onPress();
  expect(mockSetRest).toHaveBeenCalledWith(true);
});

test("turning it off needs no confirmation", () => {
  mockRing = { ...base, rest_day: true };
  const screen = render(<CareRingCard petId={7} petName="Mango" />);
  fireEvent.press(screen.getByText("It's not a rest day"));
  expect(alertSpy).not.toHaveBeenCalled();
  expect(mockSetRest).toHaveBeenCalledWith(false);
});

test("without a dog name the title is generic", () => {
  const screen = render(<CareRingCard petId={7} />);
  fireEvent.press(screen.getByText("Taking a rest day?"));
  expect(alertSpy.mock.calls[0][0]).toBe("Take a rest day?");
});

test("Spanish (voseo)", () => {
  mockLocale = "es";
  const screen = render(<CareRingCard petId={7} petName="Mango" />);
  fireEvent.press(screen.getByText("¿Te tomás un día de descanso?"));
  const [title, body] = alertSpy.mock.calls[0];
  expect(title).toBe("¿Día de descanso para Mango?");
  expect(body).toContain("Podés deshacerlo");
  expect(buttons().map((b) => b.text)).toEqual(["Hoy no", "Sí, a descansar"]);
});
