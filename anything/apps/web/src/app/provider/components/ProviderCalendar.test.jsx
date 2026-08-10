import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// ProviderCalendar (ticket 2.24): the data + action hooks are mocked so this isolates
// grid placement and the detail-popover actions (no DB / react-query / router).
vi.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../hooks/useProviders", () => ({
  useProviderBookingsCalendar: vi.fn(),
  useBookingAction: vi.fn(),
  useProviderStaff: vi.fn(),
  useProvider: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  useProviderBookingsCalendar,
  useBookingAction,
  useProviderStaff,
  useProvider,
} from "../hooks/useProviders";
import ProviderCalendar from "./ProviderCalendar";

const ANCHOR = new Date(2026, 5, 17, 9, 0); // Wed 2026-06-17

const BOOKING = {
  id: 9,
  start_at: new Date(2026, 5, 16, 14, 0).toISOString(), // Tue 2pm, in the week
  end_at: new Date(2026, 5, 16, 14, 30).toISOString(),
  booking_status: "requested",
  pet_name: "Rex",
  pet_species: "Dog",
  owner_name: "Jane Doe",
  service_name: "Checkup",
  location_name: "Main",
  location_address: "1 St",
  value_cents: 5000,
  value_currency: "ARS",
  paid: true,
};

// A booking on the same Tue as BOOKING but a given status/hour, so all sit in-week.
function bookingWith(id, status, hour, pet) {
  return {
    ...BOOKING,
    id,
    booking_status: status,
    pet_name: pet,
    start_at: new Date(2026, 5, 16, hour, 0).toISOString(),
    end_at: new Date(2026, 5, 16, hour, 30).toISOString(),
  };
}

const mutateMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useBookingAction.mockReturnValue({ mutate: mutateMock, isPending: false });
  useProviderStaff.mockReturnValue({ data: [] });
  useProvider.mockReturnValue({
    data: { provider: { time_zone: "America/Argentina/Buenos_Aires" } },
  });
});

describe("ProviderCalendar", () => {
  it("places a booking on the grid and opens its detail popover", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [BOOKING],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);

    // The booking chip is on the grid.
    const chips = screen.getAllByTestId("calendar-booking");
    expect(chips).toHaveLength(1);
    expect(within(chips[0]).getByText("Rex")).toBeTruthy();

    // Click it → the detail dialog shows the full booking-context info.
    fireEvent.click(chips[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Jane Doe")).toBeTruthy();
    expect(within(dialog).getByText(/Main/)).toBeTruthy();
    expect(within(dialog).getByText(/Paid/)).toBeTruthy();
  });

  it("the detail Confirm action calls the existing booking-action mutation", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [BOOKING],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    fireEvent.click(screen.getAllByTestId("calendar-booking")[0]);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /confirm/i }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0][0]).toMatchObject({
      appointmentId: 9,
      action: "confirm",
    });
  });

  it("shows an empty state when there are no bookings (no fakes)", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    expect(screen.getByText(/No bookings this week/i)).toBeTruthy();
    expect(screen.queryAllByTestId("calendar-booking")).toHaveLength(0);
  });

  it("hides declined + cancelled from the grid; keeps requested + confirmed + completed", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [
        bookingWith(1, "requested", 9, "ReqPet"),
        bookingWith(2, "confirmed", 10, "ConfPet"),
        bookingWith(3, "completed", 11, "DonePet"),
        bookingWith(4, "declined", 12, "DeclPet"),
        bookingWith(5, "cancelled", 13, "CancPet"),
      ],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);

    // Only the three non-terminal-negative statuses render.
    expect(screen.getAllByTestId("calendar-booking")).toHaveLength(3);
    expect(screen.getByText("ReqPet")).toBeTruthy();
    expect(screen.getByText("ConfPet")).toBeTruthy();
    expect(screen.getByText("DonePet")).toBeTruthy();
    expect(screen.queryByText("DeclPet")).toBeNull();
    expect(screen.queryByText("CancPet")).toBeNull();
  });

  it("renders a completed booking muted (read-only)", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [bookingWith(3, "completed", 11, "DonePet")],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    const chip = screen.getByTestId("calendar-booking");
    expect(chip.className).toContain("opacity-70");
  });

  it("renders a 60-min booking about twice the block height of a 30-min booking (proportional)", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [
        {
          ...BOOKING,
          id: 1,
          pet_name: "HalfHour",
          start_at: new Date(2026, 5, 16, 9, 0).toISOString(),
          end_at: new Date(2026, 5, 16, 9, 30).toISOString(),
        },
        {
          ...BOOKING,
          id: 2,
          pet_name: "FullHour",
          start_at: new Date(2026, 5, 16, 10, 0).toISOString(),
          end_at: new Date(2026, 5, 16, 11, 0).toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    const blocks = screen.getAllByTestId("calendar-booking");
    expect(blocks).toHaveLength(2);

    const heightOf = (name) =>
      parseFloat(
        blocks.find((el) => within(el).queryByText(name)).style.height,
      );
    const half = heightOf("HalfHour");
    const full = heightOf("FullHour");
    expect(full).toBeGreaterThan(half);
    expect(full).toBeCloseTo(2 * half, 1); // duration drives height
  });

  it("lays two time-overlapping bookings side-by-side (both visible, neither hidden)", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [
        {
          ...BOOKING,
          id: 1,
          pet_name: "OverlapA",
          start_at: new Date(2026, 5, 16, 9, 0).toISOString(),
          end_at: new Date(2026, 5, 16, 10, 0).toISOString(),
        },
        {
          ...BOOKING,
          id: 2,
          pet_name: "OverlapB",
          start_at: new Date(2026, 5, 16, 9, 30).toISOString(),
          end_at: new Date(2026, 5, 16, 10, 30).toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    const blocks = screen.getAllByTestId("calendar-booking");
    expect(blocks).toHaveLength(2);
    // Both blocks are present (neither covers the other).
    expect(screen.getByText("OverlapA")).toBeTruthy();
    expect(screen.getByText("OverlapB")).toBeTruthy();
    // Side-by-side: two distinct lane offsets, each half width.
    const lefts = blocks.map((el) => el.style.left);
    expect(new Set(lefts)).toEqual(new Set(["0%", "50%"]));
  });

  it("the popover uses shared bookingActions: requested → Confirm + Decline + Assign, no Cancel", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [bookingWith(1, "requested", 9, "ReqPet")],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    fireEvent.click(screen.getByTestId("calendar-booking"));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("button", { name: /confirm/i })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /decline/i })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /assign/i })).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: /cancel/i }),
    ).toBeNull();
  });

  it("the popover uses shared bookingActions: confirmed → Cancel, not Confirm", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [bookingWith(2, "confirmed", 10, "ConfPet")],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    fireEvent.click(screen.getByTestId("calendar-booking"));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("button", { name: /cancel/i })).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: /confirm/i }),
    ).toBeNull();
  });

  it("a completed booking's popover shows no state-changing actions and no dead-end", () => {
    useProviderBookingsCalendar.mockReturnValue({
      data: [bookingWith(3, "completed", 11, "DonePet")],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    fireEvent.click(screen.getByTestId("calendar-booking"));
    const dialog = screen.getByRole("dialog");

    for (const name of [/confirm/i, /decline/i, /cancel/i, /assign/i]) {
      expect(within(dialog).queryByRole("button", { name })).toBeNull();
    }
    // Graceful read-only view — not the old "No actions available" dead-end.
    expect(within(dialog).queryByText("No actions available")).toBeNull();
    expect(within(dialog).getByText("Read-only booking")).toBeTruthy();
  });

  it("renders the popover when in the provider's timezone and shows the #id", () => {
    // A fixed UTC instant that lands in business hours in BOTH the CI runner (UTC,
    // hour 15) and dev (Buenos Aires −03, hour 12) so the chip always places on the
    // grid; the popover `when` is formatted with the explicit provider zone → 12:00.
    useProviderBookingsCalendar.mockReturnValue({
      data: [
        {
          ...BOOKING,
          id: 42,
          booking_status: "confirmed",
          start_at: "2026-06-16T15:00:00.000Z",
          end_at: "2026-06-16T15:30:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<ProviderCalendar providerId={100} initialAnchor={ANCHOR} />);
    fireEvent.click(screen.getByTestId("calendar-booking"));
    const dialog = screen.getByRole("dialog");

    // 15:00Z in America/Argentina/Buenos_Aires (−03) is 12:00.
    expect(within(dialog).getByText("16 Jun 2026 · 12:00")).toBeTruthy();
    expect(within(dialog).getByText("#42")).toBeTruthy();
  });
});
