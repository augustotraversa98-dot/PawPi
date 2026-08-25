// CareRingCard — the "quick check-in" is now a real (light) guided check, not a bare
// confirm. These tests pin:
//   1. pressing the action opens GeneralCheckModal in quick mode (no confirm dialog, no
//      silent write);
//   2. completing the check (onSaved) reveals an Undo affordance;
//   3. Undo deletes the just-created general check by id.
//
// The ring hooks, the modal, and native wrappers are mocked; we assert against the spies.

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

// A stand-in for the quick guided check: renders only when visible, echoes the suggested
// areas it was handed, and exposes a button that fires onSaved with a created row so we can
// drive the Undo flow.
jest.mock("@/components/Health/GeneralCheck/GeneralCheckModal", () => {
  const { View, Text, Pressable } = require("react-native");
  return function MockGeneralCheckModal({ visible, mode, onSaved, suggestedAreas }) {
    if (!visible) return null;
    return (
      <View>
        <Text>{`QUICK_CHECK_OPEN:${mode}`}</Text>
        <Text>{`SUGGESTED:${(suggestedAreas || []).join(",")}`}</Text>
        <Pressable onPress={() => onSaved({ id: 77 })}>
          <Text>MOCK_SAVE</Text>
        </Pressable>
      </View>
    );
  };
});

// The card derives the quick check's suggested areas from this pet's general-check
// history. Give it a fixed history so the rotation is deterministic.
jest.mock("@/hooks/useFetchHealthData", () => ({
  useGeneralChecks: () => ({ data: { checks: [] } }),
}));

// A ring one segment short of closing: care not done, not resting, not paused → the
// "quick check-in" action is offered.
const mockRing = { walk_done: true, moment_done: true, care_done: false, ring_closed: false, rest_day: false, paused: false };
jest.mock("@/hooks/useCareRing", () => ({
  useCareRing: () => ({ data: mockRing }),
  useSetRestDay: () => ({ mutate: jest.fn() }),
  useSetPause: () => ({ mutate: jest.fn() }),
  useRepairStreak: () => ({ mutate: jest.fn() }),
  careRingKey: (id) => ["care-ring", id],
}));

const mockDeleteMutateAsync = jest.fn().mockResolvedValue({ ok: true });
jest.mock("@/hooks/useHealthReinforcement", () => ({
  useDeleteGeneralCheck: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
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
  mockDeleteMutateAsync.mockClear();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("pressing the action opens the light guided check (no confirm, no write)", () => {
  const { getByText, queryByText } = render(<CareRingCard petId={7} petName="Rex" />);

  // Not open yet.
  expect(queryByText("QUICK_CHECK_OPEN:quick")).toBeNull();

  fireEvent.press(getByText("＋ Log a quick check-in"));

  // The guided check opens in quick mode — no confirm Alert, nothing written.
  expect(getByText("QUICK_CHECK_OPEN:quick")).toBeTruthy();
  // With no history the card passes the fixed opening suggestions (eyes, ears).
  expect(getByText("SUGGESTED:eyes,ears")).toBeTruthy();
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
});

test("completing the check reveals Undo", async () => {
  const { getByText } = render(<CareRingCard petId={7} petName="Rex" />);
  fireEvent.press(getByText("＋ Log a quick check-in"));

  await act(async () => { fireEvent.press(getByText("MOCK_SAVE")); });

  await waitFor(() => expect(getByText("Undo")).toBeTruthy());
});

test("Undo deletes the just-created general check by id", async () => {
  const { getByText } = render(<CareRingCard petId={7} petName="Rex" />);
  fireEvent.press(getByText("＋ Log a quick check-in"));
  await act(async () => { fireEvent.press(getByText("MOCK_SAVE")); });

  await waitFor(() => expect(getByText("Undo")).toBeTruthy());
  await act(async () => { fireEvent.press(getByText("Undo")); });

  await waitFor(() => expect(mockDeleteMutateAsync).toHaveBeenCalledWith(77));
});
