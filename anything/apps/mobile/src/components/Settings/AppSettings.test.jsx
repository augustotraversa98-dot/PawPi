// BX3 + BX4: the shared, route-agnostic app-settings body. Proves it renders the settings surface
// (delete-account control), that its header back arrow uses router.back() — so it returns to
// whichever host pushed it (More in the pet app, Profile in business mode) — and that mode="business"
// swaps in the server-backed business notification categories while HIDING the pet-owner categories
// and the Walk-tracking / Apple Health block (pet mode stays unchanged).

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => ({ setAuth: jest.fn() }) }));
jest.mock("@/i18n/localePreference", () => ({
  getLocalePreference: jest.fn().mockResolvedValue("en"),
  setLocalePreference: jest.fn(),
}));
jest.mock("@/components/Health/WalkActivity/WalkTrackingSettings", () => () => null);

const mockGetBizPrefs = jest.fn().mockResolvedValue({ walk_requests: true });
const mockSetBizCategory = jest.fn().mockResolvedValue({ walk_requests: false });
jest.mock("@/utils/businessNotificationPrefs", () => ({
  BUSINESS_NOTIF_CATEGORIES: [
    { key: "walk_requests", labelKey: "bizNotif.walkRequests", hintKey: "bizNotif.walkRequestsHint" },
  ],
  getBusinessNotificationPrefs: (...a) => mockGetBizPrefs(...a),
  setBusinessCategoryEnabled: (...a) => mockSetBizCategory(...a),
}));

import AppSettings from "./AppSettings";

beforeEach(() => jest.clearAllMocks());

it("renders the settings surface (delete-account control + language options)", () => {
  const { getByTestId } = render(<AppSettings />);
  expect(getByTestId("delete-account")).toBeTruthy();
  expect(getByTestId("lang-en")).toBeTruthy();
});

it("header back arrow returns to the host that pushed it (router.back)", () => {
  const { UNSAFE_getAllByType } = render(<AppSettings />);
  const { TouchableOpacity } = require("react-native");
  // The first TouchableOpacity in the tree is the header back button.
  fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);
  expect(mockBack).toHaveBeenCalledTimes(1);
});

// ── BX4 mode-awareness ────────────────────────────────────────────────────────

it("pet mode (default) shows the pet-owner categories + Walk tracking, not business ones", () => {
  const { getByTestId, queryByTestId, queryByText } = render(<AppSettings />);
  expect(getByTestId("notif-toggle-social")).toBeTruthy();
  expect(queryByText("WALK TRACKING")).toBeTruthy();
  expect(queryByTestId("biz-notif-toggle-walk_requests")).toBeNull();
  expect(mockGetBizPrefs).not.toHaveBeenCalled();
});

it("business mode shows the server-backed business categories and HIDES the pet blocks", async () => {
  const { getByTestId, queryByTestId, queryByText } = render(<AppSettings mode="business" />);
  // Business category present…
  expect(getByTestId("biz-notif-toggle-walk_requests")).toBeTruthy();
  // …pet-owner categories + Walk-tracking block gone.
  expect(queryByTestId("notif-toggle-social")).toBeNull();
  expect(queryByTestId("notif-toggle-care")).toBeNull();
  expect(queryByText("WALK TRACKING")).toBeNull();
  // Shared controls stay.
  expect(getByTestId("delete-account")).toBeTruthy();
  expect(getByTestId("lang-en")).toBeTruthy();
  await waitFor(() => expect(mockGetBizPrefs).toHaveBeenCalled());
});

it("business mode toggle PUTs the server pref", async () => {
  const { getByTestId } = render(<AppSettings mode="business" />);
  await waitFor(() => expect(mockGetBizPrefs).toHaveBeenCalled());
  fireEvent(getByTestId("biz-notif-toggle-walk_requests"), "valueChange", false);
  await waitFor(() =>
    expect(mockSetBizCategory).toHaveBeenCalledWith("walk_requests", false),
  );
});
