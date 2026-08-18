// WalkTrackingSettings: selecting an UNAVAILABLE (coming-soon) integration must
// write nothing — no selection, no persisted preference. The old code fell through
// for Apple Health and could persist it; this locks the structural guard.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
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

// HealthKit / Watch stubs report "not available" (the shipped reality today).
// `mock`-prefixed so the jest.mock factory may reference it.
const mockSetTrackingPreference = jest.fn(async () => true);
jest.mock("@/utils/healthKitIntegration", () => ({
  isHealthKitAvailable: async () => false,
  isAppleWatchConnected: async () => false,
  requestHealthKitPermission: async () => false,
  getTrackingPreference: () => "manual",
  setTrackingPreference: (...a) => mockSetTrackingPreference(...a),
}));

import WalkTrackingSettings from "./WalkTrackingSettings";

beforeEach(() => {
  mockSetTrackingPreference.mockClear();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

test("tapping an unavailable Apple Health option writes nothing (Alert only)", async () => {
  const { getByText } = render(<WalkTrackingSettings />);
  // Wait for availability checks to settle (both resolve false).
  await waitFor(() => getByText("Apple Health"));

  fireEvent.press(getByText("Apple Health"));

  expect(Alert.alert).toHaveBeenCalledWith(
    expect.stringContaining("Apple Health"),
    expect.any(String),
  );
  // The core guarantee: no preference was persisted.
  expect(mockSetTrackingPreference).not.toHaveBeenCalled();
});

test("tapping an unavailable Apple Watch option writes nothing (Alert only)", async () => {
  const { getByText } = render(<WalkTrackingSettings />);
  await waitFor(() => getByText("Apple Watch"));

  fireEvent.press(getByText("Apple Watch"));

  expect(Alert.alert).toHaveBeenCalledWith(
    expect.stringContaining("Apple Watch"),
    expect.any(String),
  );
  expect(mockSetTrackingPreference).not.toHaveBeenCalled();
});

test("manual tracking (available) still selects + persists", async () => {
  const { getByText } = render(<WalkTrackingSettings />);
  await waitFor(() => getByText("Manual tracking"));

  fireEvent.press(getByText("Manual tracking"));

  await waitFor(() =>
    expect(mockSetTrackingPreference).toHaveBeenCalledWith("manual"),
  );
});
