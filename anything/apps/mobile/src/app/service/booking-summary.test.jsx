// BOOKING DETAIL screen (My Activity → a booking, upcoming OR past). Asserts: summary fields +
// the "Paid" empty state (past), Location (name/address/directions/message), the UPCOMING
// "Share clinic history" flow (share → grant, Shared + revoke), and that COMPLETED past behavior
// (Leave a review) is unchanged. Data hooks, router, Linking/Alert, WriteReviewModal, i18n and
// chrome are mocked; i18n resolves REAL en.json.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking, Alert } from "react-native";

const mockPush = jest.fn();
const mockStartThread = jest.fn();
const mockCreateGrant = jest.fn();
const mockUpdateGrant = jest.fn();
let mockDetail;
let mockGrants;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({ id: "bk-1" }),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/useProviders", () => ({
  useBookingDetail: () => mockDetail,
  useStartThread: () => ({ mutate: mockStartThread, isPending: false }),
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useCareAccessGrants: () => ({ data: mockGrants }),
  useCreateCareGrant: () => ({ mutate: mockCreateGrant, isPending: false }),
  useUpdateGrant: () => ({ mutate: mockUpdateGrant, isPending: false }),
}));
jest.mock("@/components/Providers/WriteReviewModal", () => {
  const { View, Text } = require("react-native");
  return ({ visible, providerId, petId }) =>
    visible ? (
      <View testID="write-review-modal">
        <Text testID="review-provider-id">{String(providerId)}</Text>
        <Text testID="review-pet-id">{String(petId)}</Text>
      </View>
    ) : null;
});

import BookingSummaryScreen from "./booking-summary";

const ok = (booking) => ({ data: booking, isLoading: false, isError: false, refetch: jest.fn() });

const LOCATION = {
  name: "Main Clinic",
  address: "123 Main St",
  hours_json: null,
  lat: -34.6,
  lng: -58.4,
};

const COMPLETED = {
  id: "bk-1",
  service_name: "Wellness exam",
  notes: "Vaccines updated",
  booking_status: "completed",
  status: "completed",
  appointment_date: "2026-01-01",
  appointment_time: "10:00",
  provider_id: 9,
  provider_name: "Vet A",
  provider_slug: "vet-a",
  pet_id: 3,
  pet_name: "Rex",
  paid: null,
  location: LOCATION,
};

const UPCOMING = { ...COMPLETED, booking_status: "confirmed", status: "confirmed" };

beforeEach(() => {
  mockPush.mockReset();
  mockStartThread.mockReset();
  mockCreateGrant.mockReset();
  mockUpdateGrant.mockReset();
  mockGrants = [];
  jest.spyOn(Linking, "openURL").mockImplementation(() => Promise.resolve());
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── unchanged / core ─────────────────────────────────────────────────────────
test("loading: shows a spinner", () => {
  mockDetail = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
  const { getByTestId } = render(<BookingSummaryScreen />);
  expect(getByTestId("booking-summary-loading")).toBeTruthy();
});

test("error: shows the error state", () => {
  mockDetail = { data: undefined, isLoading: false, isError: true, refetch: jest.fn() };
  const { getByTestId } = render(<BookingSummaryScreen />);
  expect(getByTestId("booking-summary-error")).toBeTruthy();
});

test("renders the summary fields and the empty 'Paid' state (no fake number)", async () => {
  mockDetail = ok(COMPLETED);
  const { getByText, getByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByText("Wellness exam")).toBeTruthy());
  expect(getByText("Vaccines updated")).toBeTruthy();
  expect(getByTestId("booking-summary-paid")).toBeTruthy();
  expect(getByText("Not recorded")).toBeTruthy();
});

test("shows the settled amount when a payment is recorded", async () => {
  mockDetail = ok({ ...COMPLETED, paid: { amount_cents: 10000, currency: "ARS" } });
  const { getByText } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByText("ARS 100.00")).toBeTruthy());
});

test("shows the booking status as a styled chip (completed → Completed)", async () => {
  mockDetail = ok(COMPLETED);
  const { getByTestId, getByText } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-status-chip")).toBeTruthy());
  expect(getByText("Completed")).toBeTruthy();
});

test("a cancelled booking reads 'Cancelled' in the status chip", async () => {
  mockDetail = ok({ ...COMPLETED, booking_status: "cancelled", status: "cancelled" });
  const { getByTestId, getByText } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-status-chip")).toBeTruthy());
  expect(getByText("Cancelled")).toBeTruthy();
});

// ── Location ────────────────────────────────────────────────────────────────
test("renders the Location section (name + address) with directions + message", async () => {
  mockDetail = ok(UPCOMING);
  const { getByTestId, getByText } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-location")).toBeTruthy());
  expect(getByText("Main Clinic")).toBeTruthy();
  expect(getByText("123 Main St")).toBeTruthy();
  expect(getByTestId("booking-summary-directions")).toBeTruthy();
  expect(getByTestId("booking-summary-message")).toBeTruthy();
});

test("Get directions opens a maps URL via Linking", async () => {
  mockDetail = ok(UPCOMING);
  const { getByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-directions")).toBeTruthy());
  fireEvent.press(getByTestId("booking-summary-directions"));
  expect(Linking.openURL).toHaveBeenCalledWith(
    expect.stringContaining("-34.6%2C-58.4"), // "lat,lng" url-encoded
  );
});

test("Message provider starts a thread and routes to provider-chat", async () => {
  mockStartThread.mockImplementation((vars, opts) =>
    opts.onSuccess({ thread: { id: 55, owner_user_id: 7 } }),
  );
  mockDetail = ok(UPCOMING);
  const { getByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-message")).toBeTruthy());
  fireEvent.press(getByTestId("booking-summary-message"));
  expect(mockStartThread).toHaveBeenCalledWith(
    { providerId: 9 },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/provider-chat",
    params: { threadId: "55", providerName: "Vet A", ownerUserId: "7" },
  });
});

// ── Share clinic history (upcoming) ───────────────────────────────────────────
test("UPCOMING with no grant: shows 'Share medical records' and creates the grant", async () => {
  mockDetail = ok(UPCOMING);
  const { getByTestId, queryByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-share")).toBeTruthy());
  expect(queryByTestId("booking-summary-shared")).toBeNull();
  const cta = getByTestId("booking-summary-share-cta");
  fireEvent.press(cta);
  expect(mockCreateGrant).toHaveBeenCalledWith(
    { petId: 3, providerId: 9 },
    expect.any(Object),
  );
});

test("UPCOMING with an active grant: shows Shared + Revoke, no share CTA", async () => {
  mockGrants = [{ id: 50, provider_id: 9, status: "active" }];
  mockDetail = ok(UPCOMING);
  const { getByTestId, queryByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-shared")).toBeTruthy());
  expect(queryByTestId("booking-summary-share-cta")).toBeNull();
  expect(getByTestId("booking-summary-revoke")).toBeTruthy();
});

test("Revoke confirms then revokes the grant", async () => {
  // Auto-confirm: invoke the destructive button in the Alert.
  Alert.alert.mockImplementation((title, body, buttons) => {
    buttons.find((b) => b.style === "destructive").onPress();
  });
  mockGrants = [{ id: 50, provider_id: 9, status: "active" }];
  mockDetail = ok(UPCOMING);
  const { getByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-revoke")).toBeTruthy());
  fireEvent.press(getByTestId("booking-summary-revoke"));
  expect(Alert.alert).toHaveBeenCalled();
  expect(mockUpdateGrant).toHaveBeenCalledWith({ grantId: 50, action: "revoke" });
});

test("share section is HIDDEN for a completed booking (past behavior)", async () => {
  mockDetail = ok(COMPLETED);
  const { getByText, queryByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByText("Wellness exam")).toBeTruthy());
  expect(queryByTestId("booking-summary-share")).toBeNull();
});

// ── Review (completed) — unchanged ────────────────────────────────────────────
test("Leave a review shows for a completed booking and opens the modal", async () => {
  mockDetail = ok(COMPLETED);
  const { getByTestId, queryByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-review")).toBeTruthy());
  expect(queryByTestId("write-review-modal")).toBeNull();
  fireEvent.press(getByTestId("booking-summary-review"));
  expect(getByTestId("write-review-modal")).toBeTruthy();
  expect(getByTestId("review-provider-id").props.children).toBe("9");
  expect(getByTestId("review-pet-id").props.children).toBe("3");
});

test("Leave a review is HIDDEN for an upcoming booking (only completed)", async () => {
  mockDetail = ok(UPCOMING);
  const { getByText, queryByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByText("Wellness exam")).toBeTruthy());
  expect(queryByTestId("booking-summary-review")).toBeNull();
});

test("View provider routes to the storefront by slug", async () => {
  mockDetail = ok(COMPLETED);
  const { getByTestId } = render(<BookingSummaryScreen />);
  await waitFor(() => expect(getByTestId("booking-summary-view-provider")).toBeTruthy());
  fireEvent.press(getByTestId("booking-summary-view-provider"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "vet-a" },
  });
});