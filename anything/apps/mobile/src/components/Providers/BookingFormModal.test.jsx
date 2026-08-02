// Contract for the booking form:
//   - with no active pet it blocks (alerts, never books);
//   - Confirm books with the active pet's petId + the provider id + the chosen
//     canonical date/time;
//   - the service/location ids it sends are ones from THIS provider's profile.
// useCurrentPet + useBookProvider are mocked; DateField/TimeField are stubbed to
// emit canonical values on press, so no native picker is involved.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";

let mockCurrentPet;
const mockMutateAsync = jest.fn(() => Promise.resolve({ appointment: { id: 1 } }));
const mockCheckoutMutateAsync = jest.fn(() =>
  Promise.resolve({ order: { id: 900 }, checkoutUrl: "https://mp/checkout/900" }),
);

jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockCurrentPet }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useBookProvider: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useBookingCheckout: () => ({
    mutateAsync: mockCheckoutMutateAsync,
    isPending: false,
  }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
const mockAddBookingToCalendar = jest.fn();
const mockAddTelehealthToCalendar = jest.fn();
jest.mock("@/utils/calendarIntegration", () => ({
  addBookingToCalendar: (...a) => mockAddBookingToCalendar(...a),
  addTelehealthToCalendar: (...a) => mockAddTelehealthToCalendar(...a),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
// Stub the shared fields to emit canonical values on press (no native picker).
jest.mock("@/components/DateField", () => {
  const { Text, Pressable } = require("react-native");
  return {
    __esModule: true,
    default: ({ onChange, testID }) => (
      <Pressable testID={testID} onPress={() => onChange("2026-07-01")}>
        <Text>date</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/components/TimeField", () => {
  const { Text, Pressable } = require("react-native");
  return {
    __esModule: true,
    default: ({ onChange, testID }) => (
      <Pressable testID={testID} onPress={() => onChange("09:30")}>
        <Text>time</Text>
      </Pressable>
    ),
  };
});

import BookingFormModal from "./BookingFormModal";

const PROVIDER = { id: 3, name: "Happy Paws" };
const SERVICES = [{ id: 5, name: "Checkup", price_cents: 5000, active: true }];
const LOCATIONS = [{ id: 8, name: "Main St", address: "1 Main" }];

beforeEach(() => {
  mockMutateAsync.mockClear();
  mockCheckoutMutateAsync
    .mockClear()
    .mockResolvedValue({ order: { id: 900 }, checkoutUrl: "https://mp/checkout/900" });
  mockAddBookingToCalendar.mockReset().mockResolvedValue({ success: true, eventId: "evt-1" });
  mockAddTelehealthToCalendar.mockReset().mockResolvedValue({ success: true, eventId: "evt-2" });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderForm() {
  return render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={PROVIDER}
      locations={LOCATIONS}
      services={SERVICES}
    />,
  );
}

test("blocks (alerts, no POST) when there is no active pet", () => {
  mockCurrentPet = null;
  const { getByText, getByTestId } = renderForm();

  // Even with a valid date/time, no pet → no booking.
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm appointment"));

  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    "No active pet",
    expect.any(String),
  );
});

test("Confirm books with the active petId, provider id and canonical date/time", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = renderForm();

  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm appointment"));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

  const arg = mockMutateAsync.mock.calls[0][0];
  expect(arg).toMatchObject({
    providerId: 3,
    petId: 7,
    appointment_date: "2026-07-01",
    appointment_time: "09:30",
  });
  // No service/location chosen → those ids are omitted.
  expect(arg.service_id).toBeUndefined();
  expect(arg.provider_location_id).toBeUndefined();
});

test("only sends service/location ids that belong to this provider", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = renderForm();

  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-service-5")); // from SERVICES
  fireEvent.press(getByTestId("booking-location-8")); // from LOCATIONS
  fireEvent.press(getByText("Confirm appointment"));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

  const arg = mockMutateAsync.mock.calls[0][0];
  expect(arg.service_id).toBe(5);
  expect(arg.provider_location_id).toBe(8);
});

// ── Ticket 2.80: optional add-to-calendar ─────────────────────────────────────
test("does NOT add to calendar unless the toggle is on (calendar_event_id undefined)", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = renderForm();
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm appointment"));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockAddBookingToCalendar).not.toHaveBeenCalled();
  expect(mockMutateAsync.mock.calls[0][0].calendar_event_id).toBeUndefined();
});

test("toggling add-to-calendar creates the event and persists the id on the booking", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = renderForm();
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-add-calendar"));
  fireEvent.press(getByText("Confirm appointment"));
  await waitFor(() => expect(mockAddBookingToCalendar).toHaveBeenCalled());
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].calendar_event_id).toBe("evt-1");
});

test("a denied calendar permission still books (no calendar_event_id)", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  mockAddBookingToCalendar.mockResolvedValue({ success: false, error: "permission_denied" });
  const { getByText, getByTestId } = renderForm();
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-add-calendar"));
  fireEvent.press(getByText("Confirm appointment"));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].calendar_event_id).toBeUndefined();
});

test("telehealth capability uses the telehealth calendar builder", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={{ id: 3, name: "TeleVet" }}
      locations={[]}
      services={[]}
      capability="telehealth"
    />,
  );
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-add-calendar"));
  fireEvent.press(getByText("Confirm service"));
  await waitFor(() => expect(mockAddTelehealthToCalendar).toHaveBeenCalled());
  expect(mockAddBookingToCalendar).not.toHaveBeenCalled();
});

// ── Ticket 2.4: generalized to any capability ─────────────────────────────────
test("defaults capability to 'vet' and shows the appointment CTA", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = renderForm();

  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm appointment")); // vet noun = "appointment"

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].capability).toBe("vet");
});

test("a groomer capability books with capability 'groomer' and grooming copy", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={{ id: 3, name: "Pet Spa", provider_type: "groomer" }}
      locations={[]}
      services={[]}
    />,
  );

  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm grooming")); // groomer noun = "grooming"

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].capability).toBe("groomer");
});

// ── Ticket 2.6: recurring grooming cycle ──────────────────────────────────────
test("a groomer booking sends recurrence_rule ONLY when the owner opts in", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const renderGroomer = () =>
    render(
      <BookingFormModal
        visible
        onClose={jest.fn()}
        provider={{ id: 3, name: "Pet Spa" }}
        locations={[]}
        services={[]}
        capability="groomer"
      />,
    );

  // Without opting in → no recurrence_rule.
  let view = renderGroomer();
  fireEvent.press(view.getByTestId("booking-date"));
  fireEvent.press(view.getByTestId("booking-time"));
  fireEvent.press(view.getByText("Confirm grooming"));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].recurrence_rule).toBeUndefined();

  mockMutateAsync.mockClear();
  view.unmount();

  // Opting in to "every 6 weeks" → the booking carries the RRULE.
  view = renderGroomer();
  fireEvent.press(view.getByTestId("booking-date"));
  fireEvent.press(view.getByTestId("booking-time"));
  fireEvent.press(view.getByTestId("booking-recurrence"));
  fireEvent.press(view.getByText("Confirm grooming"));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].recurrence_rule).toBe(
    "FREQ=WEEKLY;INTERVAL=6",
  );
});

// ── Booking payments (Phase 3): pay-at-request for a paid service ──────────────
const PAID_FULL = [
  { id: 5, name: "Checkup", price_cents: 5000, deposit_cents: 1500, payment_policy: "full", active: true },
];

test("a 'full' policy service starts checkout, links the order, and opens MercadoPago", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={PAID_FULL} />,
  );
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-service-5"));
  fireEvent.press(getByText("Confirm appointment"));

  await waitFor(() => expect(mockCheckoutMutateAsync).toHaveBeenCalledTimes(1));
  // 'full' → the full price is charged.
  expect(mockCheckoutMutateAsync.mock.calls[0][0]).toMatchObject({
    provider_id: 3,
    amount_cents: 5000,
  });
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  // The booking is linked to the checkout order, and MercadoPago is opened.
  expect(mockMutateAsync.mock.calls[0][0].order_id).toBe(900);
  await waitFor(() =>
    expect(Linking.openURL).toHaveBeenCalledWith("https://mp/checkout/900"),
  );
});

test("a 'deposit' policy charges the deposit amount, not the full price", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const services = [
    { id: 5, name: "Groom", price_cents: 5000, deposit_cents: 1500, payment_policy: "deposit", active: true },
  ];
  const { getByText, getByTestId } = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={services} />,
  );
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-service-5"));
  fireEvent.press(getByText("Confirm appointment"));

  await waitFor(() => expect(mockCheckoutMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockCheckoutMutateAsync.mock.calls[0][0].amount_cents).toBe(1500);
  // Let the fire-and-forget redirect settle so it can't leak into the next test.
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
});

test("a 'none' policy service books free — no checkout, no order_id, no redirect", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  // SERVICES service 5 has no payment_policy → 'none'.
  const { getByText, getByTestId } = renderForm();
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-service-5"));
  fireEvent.press(getByText("Confirm appointment"));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockCheckoutMutateAsync).not.toHaveBeenCalled();
  expect(mockMutateAsync.mock.calls[0][0].order_id).toBeUndefined();
});

test("if checkout fails (e.g. provider not connected → 503) it does NOT create a free booking", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  mockCheckoutMutateAsync.mockRejectedValueOnce(new Error("payments not configured"));
  const { getByText, getByTestId } = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={PAID_FULL} />,
  );
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-service-5"));
  fireEvent.press(getByText("Confirm appointment"));

  await waitFor(() => expect(mockCheckoutMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).not.toHaveBeenCalled(); // no booking created
  expect(Alert.alert).toHaveBeenCalledWith("Couldn't book", "payments not configured");
});

test("a paid service whose checkout returns no URL is NOT mislabeled 'Request sent!'", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  // Checkout succeeds (no throw) but yields no payable URL — payment could not start.
  // Use mockResolvedValue (persistent) so a stray fire-and-forget redirect leaked from a
  // prior test can't consume a one-shot and let THIS booking get a real URL.
  mockCheckoutMutateAsync.mockReset().mockResolvedValue({ order: { id: 901 }, checkoutUrl: null });
  const { getByText, getByTestId } = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={PAID_FULL} />,
  );
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-service-5"));
  fireEvent.press(getByText("Confirm appointment"));

  // The booking is still created (linked to the unpaid order)...
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].order_id).toBe(901);
  // ...but the owner is told payment couldn't start — never the free-booking "Request sent!".
  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith(
      "Payment couldn't start",
      expect.stringContaining("nothing was charged"),
    ),
  );
  for (const call of Alert.alert.mock.calls) {
    expect(call[0]).not.toMatch(/request sent/i);
  }
});

test("shows a payment heads-up only once a paid service is selected", () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByTestId, queryByTestId } = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={PAID_FULL} />,
  );
  // "General" (no service) selected by default → no note.
  expect(queryByTestId("booking-payment-note")).toBeNull();
  fireEvent.press(getByTestId("booking-service-5"));
  expect(getByTestId("booking-payment-note")).toBeTruthy();
});
