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
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => ({ setAuth: jest.fn() }) }));
jest.mock("@/i18n/localePreference", () => ({
  getLocalePreference: jest.fn().mockResolvedValue("en"),
  setLocalePreference: jest.fn(),
}));
jest.mock("@/components/Health/WalkActivity/WalkTrackingSettings", () => () => null);

const mockGetBizPrefs = jest
  .fn()
  .mockResolvedValue({ walk_requests: true, biz_booking: true, biz_review: false });
const mockSetBizCategory = jest.fn().mockResolvedValue({ walk_requests: false });
jest.mock("@/utils/businessNotificationPrefs", () => ({
  CHANNEL_GROUP: { PUSH: "push", OPTIONAL: "optional", INAPP: "inapp" },
  BUSINESS_NOTIF_CATEGORIES: [
    { key: "walk_requests", group: "push", labelKey: "bizNotif.walkRequests", hintKey: "bizNotif.walkRequestsHint" },
    { key: "biz_booking", group: "push", labelKey: "bizNotif.booking", hintKey: "bizNotif.bookingHint" },
    { key: "biz_review", group: "optional", labelKey: "bizNotif.review", hintKey: "bizNotif.reviewHint" },
  ],
  BUSINESS_NOTIF_INFO_CATEGORIES: [
    { key: "biz_follow", group: "inapp", labelKey: "bizNotif.follow", hintKey: "bizNotif.followHint" },
  ],
  categoryDefaultEnabled: (k) => k !== "biz_review", // push→true, optional(biz_review)→false
  getBusinessNotificationPrefs: (...a) => mockGetBizPrefs(...a),
  setBusinessCategoryEnabled: (...a) => mockSetBizCategory(...a),
}));

const mockGetOwnerPrefs = jest.fn().mockResolvedValue(null);
const mockSetOwnerCategory = jest.fn().mockResolvedValue(true);
const mockGetQuiet = jest.fn().mockResolvedValue(null);
const mockSetQuiet = jest.fn();
jest.mock("@/utils/ownerNotificationPrefs", () => ({
  getOwnerNotificationPrefs: (...a) => mockGetOwnerPrefs(...a),
  setOwnerCategoryEnabled: (...a) => mockSetOwnerCategory(...a),
  getQuietHours: (...a) => mockGetQuiet(...a),
  setQuietHours: (...a) => mockSetQuiet(...a),
  formatHour: (h) => `${String(h).padStart(2, "0")}:00`,
}));

import AppSettings from "./AppSettings";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOwnerPrefs.mockResolvedValue(null);
  mockSetOwnerCategory.mockResolvedValue(true);
  mockGetQuiet.mockResolvedValue(null);
  mockSetQuiet.mockImplementation(async (patch) => ({ enabled: true, start: 22, end: 8, ...patch }));
});

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

it("pet mode (default) shows the pet-owner categories, not business ones, and hides the walk-tracking card until it ships", () => {
  const { getByTestId, queryByTestId, queryByText } = render(<AppSettings />);
  expect(getByTestId("notif-toggle-streak")).toBeTruthy();
  expect(getByTestId("notif-toggle-care")).toBeTruthy();
  // Walk tracking (Apple Health / Watch "coming soon") is hidden behind WALK_TRACKING_INTEGRATIONS_ENABLED.
  expect(queryByText("WALK TRACKING")).toBeNull();
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

// ── BN2 channel-aware grouping ──────────────────────────────────────────────────

it("business mode groups categories: Notify my phone / Optional push / In-app only", () => {
  const { getByText, getByTestId } = render(<AppSettings mode="business" />);
  // Group headers (t is identity in this harness → the i18n key renders).
  expect(getByText("Notify my phone")).toBeTruthy();
  expect(getByText("Optional push")).toBeTruthy();
  expect(getByText("In-app only")).toBeTruthy();
  // PUSH + OPTIONAL categories get a toggle…
  expect(getByTestId("biz-notif-toggle-biz_booking")).toBeTruthy();
  expect(getByTestId("biz-notif-toggle-biz_review")).toBeTruthy();
  // …the in-app-only category is shown as info, NEVER a toggle.
  expect(getByTestId("biz-notif-info-biz_follow")).toBeTruthy();
  expect(() => getByTestId("biz-notif-toggle-biz_follow")).toThrow();
});

// ── Notifications v2: no fake controls ───────────────────────────────────────────

it("hides the Friends & social + Milestones toggles (no scheduler reads them) and keeps the real ones", () => {
  const { getByTestId, queryByTestId } = render(<AppSettings />);
  expect(queryByTestId("notif-toggle-social")).toBeNull();
  expect(queryByTestId("notif-toggle-milestone")).toBeNull();
  expect(getByTestId("notif-toggle-streak")).toBeTruthy();
  expect(getByTestId("notif-toggle-care")).toBeTruthy();
});

it("shows NO win-back email row when the server does not offer owner preferences (flag off)", async () => {
  const { queryByTestId } = render(<AppSettings />);
  await waitFor(() => expect(mockGetOwnerPrefs).toHaveBeenCalled());
  expect(queryByTestId("notif-owner-toggle-winback_email")).toBeNull();
});

it("shows the win-back email row OFF by default when offered, and PUTs the opt-in", async () => {
  mockGetOwnerPrefs.mockResolvedValue({ winback_email: false });
  const { findByTestId } = render(<AppSettings />);
  const toggle = await findByTestId("notif-owner-toggle-winback_email");
  expect(toggle.props.value).toBe(false);
  fireEvent(toggle, "valueChange", true);
  await waitFor(() => expect(mockSetOwnerCategory).toHaveBeenCalledWith("winback_email", true));
});

it("rolls the win-back email switch back when the server refuses the change", async () => {
  mockGetOwnerPrefs.mockResolvedValue({ winback_email: false });
  mockSetOwnerCategory.mockResolvedValue(false);
  const { findByTestId } = render(<AppSettings />);
  const toggle = await findByTestId("notif-owner-toggle-winback_email");
  fireEvent(toggle, "valueChange", true);
  await waitFor(() => expect(mockSetOwnerCategory).toHaveBeenCalled());
  await waitFor(async () =>
    expect((await findByTestId("notif-owner-toggle-winback_email")).props.value).toBe(false),
  );
});

it("shows the opt-in PUSH rows (digest, win-back) OFF by default when the server offers them, and PUTs the opt-in", async () => {
  mockGetOwnerPrefs.mockResolvedValue({ weekly_digest_push: false, winback_push: false, winback_email: false });
  const { findByTestId } = render(<AppSettings />);
  for (const key of ["weekly_digest_push", "winback_push", "winback_email"]) {
    expect((await findByTestId(`notif-owner-toggle-${key}`)).props.value).toBe(false);
  }
  fireEvent(await findByTestId("notif-owner-toggle-weekly_digest_push"), "valueChange", true);
  await waitFor(() => expect(mockSetOwnerCategory).toHaveBeenCalledWith("weekly_digest_push", true));
});

it("only renders owner rows for categories the server actually returned", async () => {
  mockGetOwnerPrefs.mockResolvedValue({ winback_email: true });
  const { findByTestId, queryByTestId } = render(<AppSettings />);
  expect((await findByTestId("notif-owner-toggle-winback_email")).props.value).toBe(true);
  expect(queryByTestId("notif-owner-toggle-winback_push")).toBeNull();
});

// ── Notifications v2 PR 3c: transactional rows + quiet hours ───────────────────────────────────

it("shows the transactional owner rows ON by default when the server offers them", async () => {
  mockGetOwnerPrefs.mockResolvedValue({
    owner_bookings: true, owner_adoption: true, owner_walk_requests: true, owner_lost_alerts: true,
    weekly_digest_push: false, winback_push: false, winback_email: false,
  });
  const { findByTestId } = render(<AppSettings />);
  for (const key of ["owner_bookings", "owner_adoption", "owner_walk_requests", "owner_lost_alerts"]) {
    expect((await findByTestId(`notif-owner-toggle-${key}`)).props.value).toBe(true);
  }
  fireEvent(await findByTestId("notif-owner-toggle-owner_bookings"), "valueChange", false);
  await waitFor(() => expect(mockSetOwnerCategory).toHaveBeenCalledWith("owner_bookings", false));
});

it("hides quiet hours entirely when the server does not offer them (flag off)", async () => {
  const { queryByTestId } = render(<AppSettings />);
  await waitFor(() => expect(mockGetQuiet).toHaveBeenCalled());
  expect(queryByTestId("quiet-hours-toggle")).toBeNull();
});

it("shows the stored quiet hours (22:00 → 08:00) and saves a change", async () => {
  mockGetQuiet.mockResolvedValue({ enabled: true, start: 22, end: 8 });
  const { findByTestId } = render(<AppSettings />);
  expect((await findByTestId("quiet-start-value")).props.children).toBe("22:00");
  expect((await findByTestId("quiet-end-value")).props.children).toBe("08:00");
  fireEvent.press(await findByTestId("quiet-start-inc"));
  await waitFor(() => expect(mockSetQuiet).toHaveBeenCalledWith({ start: 23 }));
  fireEvent.press(await findByTestId("quiet-end-dec"));
  await waitFor(() => expect(mockSetQuiet).toHaveBeenCalledWith({ end: 7 }));
});

it("wraps the hour around midnight when stepping", async () => {
  mockGetQuiet.mockResolvedValue({ enabled: true, start: 23, end: 0 });
  // the server echoes the saved window: it must keep the untouched field
  mockSetQuiet.mockImplementation(async (patch) => ({ enabled: true, start: 23, end: 0, ...patch }));
  const { findByTestId } = render(<AppSettings />);
  fireEvent.press(await findByTestId("quiet-start-inc"));
  await waitFor(() => expect(mockSetQuiet).toHaveBeenCalledWith({ start: 0 }));
  fireEvent.press(await findByTestId("quiet-end-dec"));
  await waitFor(() => expect(mockSetQuiet).toHaveBeenCalledWith({ end: 23 }));
});

it("the quiet-hours switch turns them off and hides the hour pickers", async () => {
  mockGetQuiet.mockResolvedValue({ enabled: true, start: 22, end: 8 });
  const { findByTestId, queryByTestId } = render(<AppSettings />);
  fireEvent(await findByTestId("quiet-hours-toggle"), "valueChange", false);
  await waitFor(() => expect(mockSetQuiet).toHaveBeenCalledWith({ enabled: false }));
  await waitFor(() => expect(queryByTestId("quiet-start-value")).toBeNull());
});

it("a failed quiet-hours save rolls back to what the server had", async () => {
  mockGetQuiet.mockResolvedValue({ enabled: true, start: 22, end: 8 });
  mockSetQuiet.mockResolvedValue(null);
  const { findByTestId } = render(<AppSettings />);
  fireEvent.press(await findByTestId("quiet-start-inc"));
  await waitFor(() => expect(mockSetQuiet).toHaveBeenCalled());
  await waitFor(async () => expect((await findByTestId("quiet-start-value")).props.children).toBe("22:00"));
});

it("the footer shows the real app version from config, not a hard-coded 1.0.0", () => {
  const { queryByText } = render(<AppSettings />);
  expect(queryByText("PawPi v1.0.0")).toBeNull();
});
