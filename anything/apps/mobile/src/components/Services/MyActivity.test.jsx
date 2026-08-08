// My Activity pane: the consolidated owner surface (bookings, reservations, appointments,
// messages, shopping). It ONLY links into existing screens + aggregates useMyBookings; it
// duplicates NO management UI. Every provider hook, the router, the current pet and i18n are
// mocked; i18n resolves REAL en.json.

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

const mockPush = jest.fn();
// The mocked RefreshableScrollView captures the `refetch` prop MyActivity wires to pull-to-refresh
// so a test can invoke it directly (the real RefreshControl gesture can't fire in jsdom).
let mockCapturedRefetch;

let mockMyBookings;
let mockUnread;
let mockWalkSessions;
let mockDaycareStays;
let mockSittingVisits;
let mockOrders;
let mockSubs;
let mockSavedPlaces;
let mockCurrentPet;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
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
  return {
    RefreshableScrollView: ({ refetch, children }) => {
      mockCapturedRefetch = refetch;
      return <View>{children}</View>;
    },
  };
});
jest.mock("@/hooks/useProviders", () => ({
  useMyBookings: () => mockMyBookings,
  useUnreadCount: () => mockUnread,
  useWalkSessions: () => mockWalkSessions,
  useDaycareStays: () => mockDaycareStays,
  useSittingVisits: () => mockSittingVisits,
  useShopOrders: () => mockOrders,
  useShopSubscriptions: () => mockSubs,
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => mockCurrentPet,
}));
jest.mock("@/hooks/usePlaces", () => ({
  useSavedPlaces: () => mockSavedPlaces,
}));

import MyActivity from "./MyActivity";

const q = (data, extra = {}) => ({ data, isLoading: false, refetch: jest.fn(), ...extra });

beforeEach(() => {
  mockPush.mockReset();
  mockCapturedRefetch = undefined;
  mockMyBookings = q({ upcoming: [], past: [] });
  mockUnread = q(0);
  mockWalkSessions = q([]);
  mockDaycareStays = q([]);
  mockSittingVisits = q([]);
  mockOrders = q([]);
  mockSubs = q([]);
  mockSavedPlaces = q([]);
  mockCurrentPet = { data: { id: 42 }, isLoading: false, hasPet: true };
});

test("loading: shows a spinner while bookings load", () => {
  mockMyBookings = { data: undefined, isLoading: true, refetch: jest.fn() };
  const { getByTestId } = render(<MyActivity />);
  expect(getByTestId("activity-loading")).toBeTruthy();
});

test("empty states across every section, no fabricated rows", async () => {
  const { getByTestId, queryByTestId, getByText } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-messages")).toBeTruthy());
  expect(queryByTestId("activity-live-walk")).toBeNull(); // no in_progress walk
  expect(getByTestId("activity-upcoming-empty")).toBeTruthy();
  expect(getByTestId("activity-past-empty")).toBeTruthy();
  expect(getByText("No active bookings yet")).toBeTruthy();
  expect(getByText("No messages yet")).toBeTruthy();
  expect(getByText("No orders yet")).toBeTruthy();
  expect(getByText("No past bookings")).toBeTruthy();
  // Empty doorways are hidden (no "no activity" clutter): daycare/sitting/saved-places.
  expect(queryByTestId("activity-daycare")).toBeNull();
  expect(queryByTestId("activity-sitting")).toBeNull();
  expect(queryByTestId("activity-saved-places")).toBeNull();
  // Messages + Shopping doorways stay (intentionally always present).
  expect(getByTestId("activity-messages")).toBeTruthy();
  expect(getByTestId("activity-orders")).toBeTruthy();
  expect(getByTestId("activity-autoreorder")).toBeTruthy();
  // No pending section when there are no requested bookings.
  expect(queryByTestId("activity-pending-heading")).toBeNull();
});

test("pull-to-refresh refetches the bookings list (and the other lists it renders)", async () => {
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-messages")).toBeTruthy());
  expect(mockCapturedRefetch).toEqual(expect.any(Function));
  act(() => {
    mockCapturedRefetch();
  });
  // The primary aggregator (useMyBookings) refetches, so a just-made booking appears…
  expect(mockMyBookings.refetch).toHaveBeenCalled();
  // …alongside the other lists the pane surfaces.
  expect(mockUnread.refetch).toHaveBeenCalled();
  expect(mockOrders.refetch).toHaveBeenCalled();
  expect(mockSubs.refetch).toHaveBeenCalled();
});

test("refresh handler returns an awaitable that resolves only after the refetches settle (drives the spinner)", async () => {
  // A controllable refetch: the combined promise must NOT resolve until this one does, so
  // RefreshableScrollView keeps its spinner up for the real duration (like the Discovery pane).
  let resolveBookings;
  mockMyBookings = q(
    { upcoming: [], past: [] },
    { refetch: jest.fn(() => new Promise((r) => (resolveBookings = r))) },
  );
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-messages")).toBeTruthy());

  const result = mockCapturedRefetch();
  // The handler returns a thenable so the caller (RefreshableScrollView/useRefresh) can await it.
  expect(typeof result.then).toBe("function");

  let settled = false;
  result.then(() => {
    settled = true;
  });
  // Still pending while the bookings refetch is in flight → spinner stays visible.
  await Promise.resolve();
  expect(settled).toBe(false);

  await act(async () => {
    resolveBookings();
  });
  expect(settled).toBe(true);
});

test("Messages row routes to /provider-messages and shows the unread badge", async () => {
  mockUnread = q(4);
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-messages")).toBeTruthy());
  expect(getByTestId("activity-messages-badge")).toBeTruthy();
  fireEvent.press(getByTestId("activity-messages"));
  expect(mockPush).toHaveBeenCalledWith("/provider-messages");
});

test("a live (in_progress) walk renders the live-walk row and routes to /walk-live", async () => {
  mockWalkSessions = q([
    { id: 1, status: "finished" },
    { id: 2, status: "in_progress" },
  ]);
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-live-walk")).toBeTruthy());
  fireEvent.press(getByTestId("activity-live-walk"));
  expect(mockPush).toHaveBeenCalledWith("/walk-live");
});

test("daycare row routes to /service/daycare and counts only active stays", async () => {
  mockDaycareStays = q([
    { id: 1, status: "booked" },
    { id: 2, status: "checked_in" },
    { id: 3, status: "checked_out" }, // not active
  ]);
  const { getByTestId, getByText } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-daycare")).toBeTruthy());
  expect(getByText("2 active")).toBeTruthy();
  fireEvent.press(getByTestId("activity-daycare"));
  expect(mockPush).toHaveBeenCalledWith("/service/daycare");
});

test("sitting row routes to /sitter-visits and counts only active visits", async () => {
  mockSittingVisits = q([
    { id: 1, status: "scheduled" },
    { id: 2, status: "completed" }, // not active
    { id: 3, status: "cancelled" }, // not active
  ]);
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-sitting")).toBeTruthy());
  fireEvent.press(getByTestId("activity-sitting"));
  expect(mockPush).toHaveBeenCalledWith("/sitter-visits");
});

test("upcoming bookings render from useMyBookings and route to the booking detail (not the storefront)", async () => {
  mockMyBookings = q({
    upcoming: [
      {
        id: 11,
        provider_name: "Happy Paws",
        pet_name: "Mango",
        service_name: "Checkup",
        capability: "vet",
        appointment_date: "2026-09-01",
        provider_slug: "happy-paws",
      },
    ],
    past: [],
  });
  const { getByTestId, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-booking-11")).toBeTruthy());
  expect(queryByTestId("activity-upcoming-empty")).toBeNull();
  fireEvent.press(getByTestId("activity-booking-11"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/booking-summary",
    params: { id: 11 },
  });
});

test("a telehealth booking WITH a session routes to the consult screen", async () => {
  mockMyBookings = q({
    upcoming: [
      {
        id: 12,
        provider_name: "Tele Vet",
        pet_name: "Mango",
        capability: "telehealth",
        telehealth_session_status: "scheduled",
        appointment_date: "2026-09-02",
        provider_slug: "tele-vet",
      },
    ],
    past: [],
  });
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-booking-12")).toBeTruthy());
  fireEvent.press(getByTestId("activity-booking-12"));
  expect(mockPush).toHaveBeenCalledWith("/service/telehealth");
});

test("a telehealth booking with NO session routes to the booking summary (no dead-end)", async () => {
  mockMyBookings = q({
    upcoming: [
      {
        id: 13,
        provider_name: "Tele Vet",
        pet_name: "Mango",
        capability: "telehealth",
        telehealth_session_status: null,
        appointment_date: "2026-09-03",
        provider_slug: "tele-vet",
      },
    ],
    past: [],
  });
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-booking-13")).toBeTruthy());
  fireEvent.press(getByTestId("activity-booking-13"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/booking-summary",
    params: { id: 13 },
  });
});

// ── Pending requests (requested bookings) ─────────────────────────────────────
test("each booking row shows a status chip (requested → Pending, confirmed → Confirmed), not a numeric badge", async () => {
  mockMyBookings = q({
    upcoming: [
      {
        id: 31,
        provider_name: "Happy Paws",
        pet_name: "Mango",
        capability: "vet",
        booking_status: "requested",
        appointment_date: "2026-09-01",
        provider_slug: "happy-paws",
      },
      {
        id: 32,
        provider_name: "Happy Paws",
        pet_name: "Mango",
        capability: "vet",
        booking_status: "confirmed",
        appointment_date: "2026-09-02",
        provider_slug: "happy-paws",
      },
    ],
    past: [],
  });
  const { getByTestId, getByText, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-booking-31")).toBeTruthy());
  // Both rows carry a status chip — requested reads "Pending", confirmed reads "Confirmed".
  expect(getByTestId("activity-booking-31-status")).toBeTruthy();
  expect(getByText("Pending")).toBeTruthy();
  expect(getByTestId("activity-booking-32-status")).toBeTruthy();
  expect(getByText("Confirmed")).toBeTruthy();
  // Booking rows use the status chip, never the coral count badge.
  expect(queryByTestId("activity-booking-31-badge")).toBeNull();
  expect(queryByTestId("activity-booking-32-badge")).toBeNull();
});

// ── Cancelled/declined visibility ─────────────────────────────────────────────
test("a cancelled/declined future booking is excluded from Pending AND Upcoming and moves to Past with its status label", async () => {
  mockMyBookings = q({
    upcoming: [
      { id: 41, provider_name: "Happy Paws", pet_name: "Mango", capability: "vet", booking_status: "requested", appointment_date: "2026-09-01", provider_slug: "happy-paws" },
      { id: 42, provider_name: "Happy Paws", pet_name: "Mango", capability: "vet", booking_status: "confirmed", appointment_date: "2026-09-02", provider_slug: "happy-paws" },
      { id: 43, provider_name: "Happy Paws", pet_name: "Mango", capability: "vet", booking_status: "cancelled", appointment_date: "2026-09-03", provider_slug: "happy-paws" },
      { id: 44, provider_name: "Happy Paws", pet_name: "Mango", capability: "vet", booking_status: "declined", appointment_date: "2026-09-04", provider_slug: "happy-paws" },
    ],
    past: [],
  });
  const { getByTestId, getByText, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-pending-heading")).toBeTruthy());
  // The requested row is Pending; the confirmed row is Upcoming.
  expect(getByTestId("activity-booking-41")).toBeTruthy();
  expect(getByTestId("activity-booking-42")).toBeTruthy();
  // Cancelled/declined future bookings never render as a Pending or Upcoming row…
  expect(queryByTestId("activity-booking-43")).toBeNull();
  expect(queryByTestId("activity-booking-44")).toBeNull();
  // …they fold into Past & others (count reflects the two closed bookings, kept as history).
  expect(getByText("Past & others (2)")).toBeTruthy();
  fireEvent.press(getByTestId("activity-past-toggle"));
  expect(getByTestId("activity-past-43")).toBeTruthy();
  expect(getByTestId("activity-past-43-status")).toBeTruthy();
  expect(getByText("Cancelled")).toBeTruthy();
  expect(getByText("Declined")).toBeTruthy();
  // A closed (cancelled/declined) row is NOT a genuinely-past booking: its subtitle shows just
  // the date, never a misleading "Past ·" prefix.
  expect(getByText("3 September 2026")).toBeTruthy();
  expect(getByText("4 September 2026")).toBeTruthy();
});

test("a genuinely-past booking keeps the 'Past ·' subtitle prefix; a cancelled row does not", async () => {
  mockMyBookings = q({
    upcoming: [
      { id: 61, provider_name: "Happy Paws", pet_name: "Mango", capability: "vet", booking_status: "cancelled", appointment_date: "2026-09-03", provider_slug: "happy-paws" },
    ],
    past: [
      { id: 62, provider_name: "Happy Paws", pet_name: "Mango", capability: "vet", booking_status: "completed", appointment_date: "2026-01-05", provider_slug: "happy-paws" },
    ],
  });
  const { getByTestId, getByText } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-past-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("activity-past-toggle"));
  // Genuine past-dated (completed) row keeps the prefix…
  expect(getByText("Past · 5 January 2026")).toBeTruthy();
  // …the cancelled row shows the bare date, no prefix.
  expect(getByText("3 September 2026")).toBeTruthy();
});

test("a confirmed future booking stays in Upcoming (never demoted to Past)", async () => {
  mockMyBookings = q({
    upcoming: [
      { id: 51, provider_name: "Happy Paws", pet_name: "Mango", capability: "vet", booking_status: "confirmed", appointment_date: "2026-09-02", provider_slug: "happy-paws" },
    ],
    past: [],
  });
  const { getByTestId, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-booking-51")).toBeTruthy());
  expect(queryByTestId("activity-upcoming-empty")).toBeNull();
  // Not moved into Past.
  expect(getByTestId("activity-past-empty")).toBeTruthy();
});

test("Pending requests section lists requested bookings above Upcoming; confirmed stay under Upcoming", async () => {
  mockMyBookings = q({
    upcoming: [
      {
        id: 31,
        provider_name: "Happy Paws",
        pet_name: "Mango",
        capability: "vet",
        booking_status: "requested",
        appointment_date: "2026-09-01",
        provider_slug: "happy-paws",
      },
      {
        id: 32,
        provider_name: "Happy Paws",
        pet_name: "Mango",
        capability: "vet",
        booking_status: "confirmed",
        appointment_date: "2026-09-02",
        provider_slug: "happy-paws",
      },
    ],
    past: [],
  });
  const { getByTestId, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-pending-heading")).toBeTruthy());
  // Both rows render (the requested in Pending, the confirmed under Upcoming).
  expect(getByTestId("activity-booking-31")).toBeTruthy();
  expect(getByTestId("activity-booking-32")).toBeTruthy();
  // Upcoming is NOT empty (the confirmed booking lives there).
  expect(queryByTestId("activity-upcoming-empty")).toBeNull();
});

test("Pending requests section is hidden when there are no requested bookings", async () => {
  mockMyBookings = q({
    upcoming: [
      {
        id: 32,
        provider_name: "Happy Paws",
        pet_name: "Mango",
        capability: "vet",
        booking_status: "confirmed",
        appointment_date: "2026-09-02",
        provider_slug: "happy-paws",
      },
    ],
    past: [],
  });
  const { getByTestId, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-booking-32")).toBeTruthy());
  expect(queryByTestId("activity-pending-heading")).toBeNull();
});

test("only-pending upcoming: Pending section shows the request, Upcoming shows its empty state", async () => {
  mockMyBookings = q({
    upcoming: [
      {
        id: 31,
        provider_name: "Happy Paws",
        pet_name: "Mango",
        capability: "vet",
        booking_status: "requested",
        appointment_date: "2026-09-01",
        provider_slug: "happy-paws",
      },
    ],
    past: [],
  });
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-pending-heading")).toBeTruthy());
  expect(getByTestId("activity-booking-31")).toBeTruthy();
  // No confirmed bookings → Upcoming still shows its empty row.
  expect(getByTestId("activity-upcoming-empty")).toBeTruthy();
});

test("Saved places doorway shows only when something is saved and routes to /service/places", async () => {
  mockSavedPlaces = q([{ id: 1 }, { id: 2 }]);
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-saved-places")).toBeTruthy());
  fireEvent.press(getByTestId("activity-saved-places"));
  expect(mockPush).toHaveBeenCalledWith("/service/places");
});

test("Saved places doorway is hidden when nothing is saved", async () => {
  const { getByTestId, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-messages")).toBeTruthy());
  expect(queryByTestId("activity-saved-places")).toBeNull();
});

test("Daycare/Sitting doorways are hidden when there are no active stays/visits", async () => {
  const { getByTestId, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-messages")).toBeTruthy());
  expect(queryByTestId("activity-daycare")).toBeNull();
  expect(queryByTestId("activity-sitting")).toBeNull();
});

// ── new Shopping section ──────────────────────────────────────────────────────
test("Shopping: My orders routes to /service/shop and counts orders", async () => {
  mockOrders = q([{ id: 1 }, { id: 2 }, { id: 3 }]);
  const { getByTestId, getByText } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-orders")).toBeTruthy());
  expect(getByText("3 orders")).toBeTruthy();
  fireEvent.press(getByTestId("activity-orders"));
  expect(mockPush).toHaveBeenCalledWith("/service/shop");
});

test("Shopping: Auto-reorder routes to /service/shop and counts ONLY active subs", async () => {
  mockSubs = q([
    { id: 1, status: "active" },
    { id: 2, status: "active" },
    { id: 3, status: "cancelled" }, // not active
  ]);
  const { getByTestId, getByText } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-autoreorder")).toBeTruthy());
  expect(getByText("2 active")).toBeTruthy();
  fireEvent.press(getByTestId("activity-autoreorder"));
  expect(mockPush).toHaveBeenCalledWith("/service/shop");
});

// ── new Past section (collapsible) ────────────────────────────────────────────
test("Past is collapsed by default: rows hidden, heading shows a real count", async () => {
  mockMyBookings = q({
    upcoming: [],
    past: [
      { id: 21, provider_name: "Old Vet", pet_name: "Mango", capability: "vet", appointment_date: "2025-01-01", provider_slug: "old-vet" },
      { id: 22, provider_name: "Old Groomer", pet_name: "Mango", capability: "groomer", appointment_date: "2025-01-02", provider_slug: "old-groom" },
      { id: 23, provider_name: "Old Sitter", pet_name: "Mango", capability: "sitter", appointment_date: "2025-01-03", provider_slug: "old-sit" },
    ],
  });
  const { getByTestId, queryByTestId, getByText } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-past-toggle")).toBeTruthy());
  // Count reflects past.length under the renamed "Past & others" heading…
  expect(getByText("Past & others (3)")).toBeTruthy();
  // …and the rows are hidden until expanded (no empty row either — there IS past data).
  expect(queryByTestId("activity-past-21")).toBeNull();
  expect(queryByTestId("activity-past-empty")).toBeNull();
});

test("tapping the Past toggle reveals the rows (still capped at 5) and each routes", async () => {
  mockMyBookings = q({
    upcoming: [],
    past: [
      { id: 21, provider_name: "Old Vet", pet_name: "Mango", capability: "vet", appointment_date: "2025-01-01", provider_slug: "old-vet" },
    ],
  });
  const { getByTestId, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-past-toggle")).toBeTruthy());
  expect(queryByTestId("activity-past-21")).toBeNull(); // collapsed

  fireEvent.press(getByTestId("activity-past-toggle"));
  expect(getByTestId("activity-past-21")).toBeTruthy(); // expanded

  // Past rows open the read-only booking summary by id (NOT the storefront).
  fireEvent.press(getByTestId("activity-past-21"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/booking-summary",
    params: { id: 21 },
  });

  // Toggling again collapses it.
  fireEvent.press(getByTestId("activity-past-toggle"));
  expect(queryByTestId("activity-past-21")).toBeNull();
});

test("no pet selected: renders empty states without crashing", async () => {
  mockCurrentPet = { data: null, isLoading: false, hasPet: false };
  const { getByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-messages")).toBeTruthy());
  expect(getByTestId("activity-upcoming-empty")).toBeTruthy();
  expect(getByTestId("activity-past-empty")).toBeTruthy();
});

const manyPast = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    provider_name: `Prov ${i}`,
    pet_name: "Mango",
    capability: "vet",
    appointment_date: "2025-01-01",
    provider_slug: `prov-${i}`,
  }));

test('"See all (N)" appears only when past.length > 5, and routes to the full history', async () => {
  mockMyBookings = q({ upcoming: [], past: manyPast(7) });
  const { getByTestId, getByText } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-past-toggle")).toBeTruthy());

  // Hidden while collapsed.
  fireEvent.press(getByTestId("activity-past-toggle"));
  const seeAll = getByTestId("activity-past-see-all");
  expect(seeAll).toBeTruthy();
  expect(getByText("See all (7)")).toBeTruthy(); // count reflects the FULL length

  fireEvent.press(seeAll);
  expect(mockPush).toHaveBeenCalledWith("/service/past-bookings");
});

test('no "See all" link when past.length <= 5', async () => {
  mockMyBookings = q({ upcoming: [], past: manyPast(5) });
  const { getByTestId, queryByTestId } = render(<MyActivity />);
  await waitFor(() => expect(getByTestId("activity-past-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("activity-past-toggle"));
  expect(queryByTestId("activity-past-see-all")).toBeNull();
});
