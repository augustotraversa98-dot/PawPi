// Contract for the booking form (PR-2 — OSDE-style slot picker):
//   - slot-based capabilities (vet/groomer/trainer/telehealth) book a DISCRETE slot: the
//     month calendar only enables days with availability, the CTA is disabled until a slot
//     is chosen, and Confirm posts start_at/end_at + the derived (provider-tz) date/time;
//   - non-slot capabilities (e.g. sitter) keep the free-form DateField/TimeField flow;
//   - with no active pet it blocks (alerts, never books);
//   - payment policy / deposit / recurrence / add-to-calendar logic is unchanged.
// useCurrentPet + useBookProvider + useProviderAvailability are mocked; DateField/TimeField
// are stubbed to emit canonical values on press (free-form flow only).

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";

let mockCurrentPet;
let mockAvailability;
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
  useProviderAvailability: () => mockAvailability,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k, opts) => {
      if (opts && typeof opts === "object" && "defaultValue" in opts) return opts.defaultValue;
      return k;
    },
  }),
}));
const mockAddBookingToCalendar = jest.fn();
const mockAddTelehealthToCalendar = jest.fn();
jest.mock("@/utils/calendarIntegration", () => ({
  addBookingToCalendar: (...a) => mockAddBookingToCalendar(...a),
  addTelehealthToCalendar: (...a) => mockAddTelehealthToCalendar(...a),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
// Stub the shared fields to emit canonical values on press (free-form flow, non-slot caps).
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

// One available slot TODAY (in the calendar's current, default month) at 09:00 Buenos Aires
// (= 12:00 UTC). A second in-month day with NO slots proves days are gated by availability.
const TZ = "America/Argentina/Buenos_Aires";
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const SLOT_START = `${TODAY}T12:00:00.000Z`;
const SLOT_END = `${TODAY}T12:30:00.000Z`;
const EMPTY_DAY = TODAY.endsWith("-01")
  ? `${TODAY.slice(0, 8)}02`
  : `${TODAY.slice(0, 8)}01`;

function availabilityData() {
  return {
    data: {
      time_zone: TZ,
      availability: [{ date: TODAY, slots: [{ start: SLOT_START, end: SLOT_END }] }],
    },
    isLoading: false,
  };
}

// Pick the single available slot: the day auto-selects, then tap the slot chip.
function selectSlot(view) {
  fireEvent.press(view.getByTestId(`booking-day-${TODAY}`));
  fireEvent.press(view.getByTestId(`booking-slot-${SLOT_START}`));
}

beforeEach(() => {
  mockMutateAsync.mockClear();
  mockCheckoutMutateAsync
    .mockClear()
    .mockResolvedValue({ order: { id: 900 }, checkoutUrl: "https://mp/checkout/900" });
  mockAddBookingToCalendar.mockReset().mockResolvedValue({ success: true, eventId: "evt-1" });
  mockAddTelehealthToCalendar.mockReset().mockResolvedValue({ success: true, eventId: "evt-2" });
  mockAvailability = availabilityData();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderForm(props) {
  return render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={PROVIDER}
      locations={LOCATIONS}
      services={SERVICES}
      {...props}
    />,
  );
}

// ── Slot picker gating (PR-2) ─────────────────────────────────────────────────
test("only days WITH availability are selectable; empty days are disabled", () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm();

  expect(view.getByTestId(`booking-day-${TODAY}`).props.accessibilityState.disabled).toBe(false);
  expect(view.getByTestId(`booking-day-${EMPTY_DAY}`).props.accessibilityState.disabled).toBe(true);
  // Progressive disclosure: slots appear only AFTER the date is tapped.
  fireEvent.press(view.getByTestId(`booking-day-${TODAY}`));
  expect(view.getByTestId(`booking-slot-${SLOT_START}`)).toBeTruthy();
});

// ── Progressive slot disclosure ───────────────────────────────────────────────
test("no time slots are shown until a date is selected", () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm();

  // On open: a prompt to pick a date, and NO slot chips yet.
  expect(view.getByTestId("booking-pick-date")).toBeTruthy();
  expect(view.queryByTestId(`booking-slot-${SLOT_START}`)).toBeNull();

  // Selecting the date reveals its slots and hides the prompt.
  fireEvent.press(view.getByTestId(`booking-day-${TODAY}`));
  expect(view.getByTestId(`booking-slot-${SLOT_START}`)).toBeTruthy();
  expect(view.queryByTestId("booking-pick-date")).toBeNull();
});

test("the CTA does not book until a slot is selected, then books once", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm();

  // No slot chosen yet → pressing the reserve CTA must not create a booking.
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  expect(mockMutateAsync).not.toHaveBeenCalled();

  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
});

test("a slot-based provider with NO availability shows an empty state (no free-form)", () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  mockAvailability = { data: { time_zone: TZ, availability: [] }, isLoading: false };
  const view = renderForm();

  expect(view.getByTestId("booking-no-slots")).toBeTruthy();
  expect(view.queryByTestId("booking-date")).toBeNull();
  expect(view.queryByTestId("booking-time")).toBeNull();
});

// ── Booking payload ───────────────────────────────────────────────────────────
test("blocks (alerts, no POST) when there is no active pet", () => {
  mockCurrentPet = null;
  const view = renderForm();

  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith("booking.noActivePetTitle", expect.any(String));
});

test("Confirm books with petId, provider id, the slot, and the derived provider-tz date/time", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  // Two services → "General" stays the default (single-service auto-preselect does not fire).
  const view = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={PROVIDER}
      locations={LOCATIONS}
      services={[
        { id: 5, name: "Checkup", price_cents: 5000, active: true },
        { id: 6, name: "Consulta", price_cents: 3000, active: true },
      ]}
    />,
  );

  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  const arg = mockMutateAsync.mock.calls[0][0];
  expect(arg).toMatchObject({
    providerId: 3,
    petId: 7,
    capability: "vet",
    appointment_date: TODAY, // slot's provider-local date
    appointment_time: "09:00", // 12:00 UTC = 09:00 Buenos Aires
    start_at: SLOT_START,
    end_at: SLOT_END,
  });
  // No service/location chosen → those ids are omitted.
  expect(arg.service_id).toBeUndefined();
  expect(arg.provider_location_id).toBeUndefined();
});

test("only sends service/location ids that belong to this provider", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm();

  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-service-5")); // from SERVICES
  fireEvent.press(view.getByTestId("booking-location-8")); // from LOCATIONS
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  const arg = mockMutateAsync.mock.calls[0][0];
  expect(arg.service_id).toBe(5);
  expect(arg.provider_location_id).toBe(8);
});

test("defaults capability to 'vet'", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm();
  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].capability).toBe("vet");
});

test("a groomer capability books with capability 'groomer'", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={{ id: 3, name: "Pet Spa", provider_type: "groomer" }}
      locations={[]}
      services={[]}
    />,
  );
  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].capability).toBe("groomer");
});

// ── Free-form path preserved for non-slot capabilities ────────────────────────
test("a non-slot capability (sitter) keeps the free-form DateField/TimeField flow", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={{ id: 3, name: "Sunny Sitters" }}
      locations={[]}
      services={[]}
      capability="sitter"
    />,
  );

  // Free-form fields present; no slot calendar.
  expect(view.getByTestId("booking-date")).toBeTruthy();
  expect(view.getByTestId("booking-time")).toBeTruthy();
  expect(view.queryByTestId(`booking-day-${TODAY}`)).toBeNull();

  fireEvent.press(view.getByTestId("booking-date"));
  fireEvent.press(view.getByTestId("booking-time"));
  fireEvent.press(view.getByText("Confirm sitting"));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  const arg = mockMutateAsync.mock.calls[0][0];
  expect(arg).toMatchObject({
    capability: "sitter",
    appointment_date: "2026-07-01",
    appointment_time: "09:30",
  });
  // No slot for the free-form flow.
  expect(arg.start_at).toBeUndefined();
  expect(arg.end_at).toBeUndefined();
});

// ── Ticket 2.80: optional add-to-calendar ─────────────────────────────────────
test("does NOT add to calendar unless the toggle is on (calendar_event_id undefined)", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm();
  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockAddBookingToCalendar).not.toHaveBeenCalled();
  expect(mockMutateAsync.mock.calls[0][0].calendar_event_id).toBeUndefined();
});

test("toggling add-to-calendar creates the event and persists the id on the booking", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm();
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-add-calendar"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockAddBookingToCalendar).toHaveBeenCalled());
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].calendar_event_id).toBe("evt-1");
});

test("a denied calendar permission still books (no calendar_event_id)", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  mockAddBookingToCalendar.mockResolvedValue({ success: false, error: "permission_denied" });
  const view = renderForm();
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-add-calendar"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].calendar_event_id).toBeUndefined();
});

test("telehealth capability uses the telehealth calendar builder", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={{ id: 3, name: "TeleVet" }}
      locations={[]}
      services={[]}
      capability="telehealth"
    />,
  );
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-add-calendar"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockAddTelehealthToCalendar).toHaveBeenCalled());
  expect(mockAddBookingToCalendar).not.toHaveBeenCalled();
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
  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].recurrence_rule).toBeUndefined();

  mockMutateAsync.mockClear();
  view.unmount();

  // Opting in to "every 6 weeks" → the booking carries the RRULE.
  view = renderGroomer();
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-recurrence"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].recurrence_rule).toBe(
    "FREQ=WEEKLY;INTERVAL=6",
  );
});

// ── Booking payments (Phase 3): pay-at-request for a paid service ──────────────
const PAID_FULL = [
  { id: 5, name: "Checkup", price_cents: 5000, deposit_cents: 1500, payment_policy: "full", active: true },
];

test("a single paid service is auto-selected so booking CHARGES without tapping the chip", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={PAID_FULL} />,
  );
  // Preselected → the payment heads-up is visible immediately (no chip tap).
  expect(view.queryByTestId("booking-payment-note")).toBeTruthy();

  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  await waitFor(() => expect(mockCheckoutMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockCheckoutMutateAsync.mock.calls[0][0]).toMatchObject({ provider_id: 3, amount_cents: 5000 });
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].service_id).toBe(5);
  expect(mockMutateAsync.mock.calls[0][0].order_id).toBe(900);
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith("https://mp/checkout/900"));
});

test("a 'full' policy service starts checkout, links the order, and opens MercadoPago", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={PAID_FULL} />,
  );
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-service-5"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  await waitFor(() => expect(mockCheckoutMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockCheckoutMutateAsync.mock.calls[0][0]).toMatchObject({ provider_id: 3, amount_cents: 5000 });
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
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
  const view = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={services} />,
  );
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-service-5"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  await waitFor(() => expect(mockCheckoutMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockCheckoutMutateAsync.mock.calls[0][0].amount_cents).toBe(1500);
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
});

test("a 'none' policy service books free — no checkout, no order_id, no redirect", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm(); // SERVICES service 5 has no payment_policy → 'none'
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-service-5"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockCheckoutMutateAsync).not.toHaveBeenCalled();
  expect(mockMutateAsync.mock.calls[0][0].order_id).toBeUndefined();
});

test("if checkout fails (e.g. provider not connected → 503) it does NOT create a free booking", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  mockCheckoutMutateAsync.mockRejectedValueOnce(new Error("payments not configured"));
  const view = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={PAID_FULL} />,
  );
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-service-5"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  await waitFor(() => expect(mockCheckoutMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).not.toHaveBeenCalled(); // no booking created
  expect(Alert.alert).toHaveBeenCalledWith("Couldn't book", "payments not configured");
});

test("a paid service whose checkout returns no URL is NOT mislabeled 'Request sent!'", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  mockCheckoutMutateAsync.mockReset().mockResolvedValue({ order: { id: 901 }, checkoutUrl: null });
  const view = render(
    <BookingFormModal visible onClose={jest.fn()} provider={PROVIDER} locations={[]} services={PAID_FULL} />,
  );
  selectSlot(view);
  fireEvent.press(view.getByTestId("booking-service-5"));
  fireEvent.press(view.getByText(/booking\.reserveSlot/));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].order_id).toBe(901);
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
  // Two services → "General" is the default (no single-service auto-preselect).
  const view = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={PROVIDER}
      locations={[]}
      services={[
        { id: 6, name: "Consulta", price_cents: 3000, payment_policy: "none", active: true },
        { id: 5, name: "Checkup", price_cents: 5000, deposit_cents: 1500, payment_policy: "full", active: true },
      ]}
    />,
  );
  expect(view.queryByTestId("booking-payment-note")).toBeNull();
  fireEvent.press(view.getByTestId("booking-service-5"));
  expect(view.getByTestId("booking-payment-note")).toBeTruthy();
});

// ── Modality tabs (Presencial / Videollamada) ─────────────────────────────────
test("shows modality tabs only when the provider holds both a presencial cap AND telehealth", () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  // vet + telehealth → tabs shown.
  const withTele = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={{ id: 3, name: "Vet+Tele" }}
      locations={[]}
      services={[]}
      capability="vet"
      capabilities={["vet", "telehealth"]}
    />,
  );
  expect(withTele.getByTestId("booking-modality-presencial")).toBeTruthy();
  expect(withTele.getByTestId("booking-modality-video")).toBeTruthy();
  withTele.unmount();

  // vet only → no tabs.
  const vetOnly = renderForm({ capability: "vet", capabilities: ["vet"] });
  expect(vetOnly.queryByTestId("booking-modality-presencial")).toBeNull();
});

test("switching to Videollamada books the telehealth capability", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={{ id: 3, name: "Vet+Tele" }}
      locations={[]}
      services={[]}
      capability="vet"
      capabilities={["vet", "telehealth"]}
    />,
  );
  fireEvent.press(view.getByTestId("booking-modality-video"));
  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].capability).toBe("telehealth");
});

// ── feat/tap-service-to-book: a preselected service collapses the selector ─────
test("a preselected `service` shows a static line, hides the chip selector, and books it", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const preselect = { id: 5, name: "Checkup", price_cents: 5000, active: true };
  const view = renderForm({ service: preselect });

  // The static line replaces the "General" + per-service chip selector.
  expect(view.getByTestId("booking-service-preselected")).toBeTruthy();
  expect(view.queryByTestId("booking-service-5")).toBeNull();
  expect(view.queryByText("General")).toBeNull();

  // Slot picker (vet default) is present — the flow drops straight into availability.
  expect(view.getByTestId(`booking-day-${TODAY}`)).toBeTruthy();
  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].service_id).toBe(5);
});

test("the `service` prop overrides single-service auto-preselect and survives a refetch", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  // The list holds only id 5, so auto-preselect would pick 5 — the tapped id 6 must win.
  const tapped = { id: 6, name: "Consulta", price_cents: 3000, active: true };
  const services = [{ id: 5, name: "Checkup", price_cents: 5000, active: true }];
  const props = {
    visible: true,
    onClose: jest.fn(),
    provider: PROVIDER,
    locations: [],
    services,
    service: tapped,
  };
  const view = render(<BookingFormModal {...props} />);
  // A background re-fetch swaps the services array reference — selection must not reset.
  view.rerender(<BookingFormModal {...props} services={[...services]} />);

  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].service_id).toBe(6);
});

test("with no `service` prop (bottom Book) the full service selector still renders", () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm(); // no service prop
  expect(view.queryByTestId("booking-service-preselected")).toBeNull();
  expect(view.getByTestId("booking-service-5")).toBeTruthy();
  expect(view.getByText("booking.generalChip")).toBeTruthy();
});

// ── Booking-flow polish: CTA amount + reason removal ───────────────────────────
test("the confirm CTA shows the selected service's price (pay-later) or the charge (deposit)", () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  // 'none' policy (SERVICES id 5 = $50, auto-preselected) → informational service price.
  const free = renderForm();
  expect(free.getByText(/booking\.reserveSlot · \$50/)).toBeTruthy();
  free.unmount();

  // 'deposit' policy → the CTA reflects the DEPOSIT charged ($15), not the full price.
  const dep = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={PROVIDER}
      locations={[]}
      services={[
        { id: 5, name: "Groom", price_cents: 5000, deposit_cents: 1500, payment_policy: "deposit", active: true },
      ]}
    />,
  );
  expect(dep.getByText(/booking\.reserveSlot · \$15/)).toBeTruthy();
});

test("the reason chips are gone and reason_for_visit is no longer sent", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const view = renderForm();
  // The old "Reason" section (capability reason chips) is no longer rendered.
  expect(view.queryByText("Reason")).toBeNull();

  selectSlot(view);
  fireEvent.press(view.getByText(/booking\.reserveSlot/));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].reason_for_visit).toBeUndefined();
});
