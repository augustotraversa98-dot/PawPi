// CareRingCard — NR3 guard: the "all good" check-in must be DELIBERATE and REVERSIBLE.
//
// The bug: the only writer of the ring's "care" segment for an owner was useLogAllGood,
// whose sole caller was this card's button — an instant, silent, irreversible write that
// sat right under the "Care" segment pill and was trivial to mis-tap. These tests pin:
//   1. a bare press does NOT write — it opens a confirm dialog (Alert);
//   2. only the confirm action ("Log") performs the write;
//   3. after logging, an Undo affordance deletes the just-created wellness log.
//
// The ring hooks + native wrappers are mocked; we assert against the mutation spies.

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/Health/CareRing", () => ({ CareRing: () => null }));
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/ui/Card", () => {
  const { View } = require("react-native");
  return { Card: ({ children }) => <View>{children}</View> };
});
jest.mock("@/utils/engagementNotifications", () => ({
  maybeScheduleStreakSave: () => Promise.resolve(),
}));

// A ring one segment short of closing: care not done, not resting, not paused → the
// "Log a quick check-in" action is offered.
const mockRing = { walk_done: true, moment_done: true, care_done: false, ring_closed: false, rest_day: false, paused: false };
jest.mock("@/hooks/useCareRing", () => ({
  useCareRing: () => ({ data: mockRing }),
  useSetRestDay: () => ({ mutate: jest.fn() }),
  useSetPause: () => ({ mutate: jest.fn() }),
  useRepairStreak: () => ({ mutate: jest.fn() }),
  careRingKey: (id) => ["care-ring", id],
}));

const mockLogMutateAsync = jest.fn().mockResolvedValue({ log: { id: 99 } });
const mockDeleteMutateAsync = jest.fn().mockResolvedValue({ ok: true });
jest.mock("@/hooks/useHealthReinforcement", () => ({
  useLogAllGood: () => ({ mutateAsync: mockLogMutateAsync, mutate: mockLogMutateAsync, isPending: false }),
  useDeleteWellnessLog: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, vars) => {
      const dict = require("@/i18n/locales/en.json");
      const val = key.split(".").reduce((o, p) => (o == null ? o : o[p]), dict);
      if (typeof val !== "string") return key;
      return vars
        ? val.replace(/\{\{(\w+)\}\}/g, (_, n) => String(vars[n] ?? ""))
        : val;
    },
  }),
}));

import { CareRingCard } from "./CareRingCard";

beforeEach(() => {
  mockLogMutateAsync.mockClear();
  mockDeleteMutateAsync.mockClear();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("a bare press does NOT write — it opens a confirm dialog first", () => {
  const { getByText } = render(<CareRingCard petId={7} petName="Rex" />);

  fireEvent.press(getByText("＋ Log a quick check-in"));

  // No write happened on the bare tap.
  expect(mockLogMutateAsync).not.toHaveBeenCalled();
  // A confirmation dialog was shown instead.
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  const [title, , buttons] = Alert.alert.mock.calls[0];
  expect(title).toBe("Log a quick check-in?");
  // Cancel + Log buttons, and Cancel is styled as cancel.
  expect(buttons.map((b) => b.text)).toEqual(["Cancel", "Log"]);
  expect(buttons[0].style).toBe("cancel");
});

test("only the confirm action performs the write", async () => {
  const { getByText } = render(<CareRingCard petId={7} petName="Rex" />);
  fireEvent.press(getByText("＋ Log a quick check-in"));

  // Invoke the "Log" button's onPress — this is the deliberate confirmation.
  const [, , buttons] = Alert.alert.mock.calls[0];
  await act(async () => { await buttons[1].onPress(); });

  expect(mockLogMutateAsync).toHaveBeenCalledTimes(1);
  // After logging, the Undo affordance appears.
  await waitFor(() => expect(getByText("Undo")).toBeTruthy());
});

test("Undo deletes the just-created wellness log", async () => {
  const { getByText } = render(<CareRingCard petId={7} petName="Rex" />);
  fireEvent.press(getByText("＋ Log a quick check-in"));
  const [, , buttons] = Alert.alert.mock.calls[0];
  await act(async () => { await buttons[1].onPress(); });

  await waitFor(() => expect(getByText("Undo")).toBeTruthy());
  await act(async () => { fireEvent.press(getByText("Undo")); });

  await waitFor(() => expect(mockDeleteMutateAsync).toHaveBeenCalledWith(99));
});
