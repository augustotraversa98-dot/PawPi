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
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  useProviderBookingsCalendar,
  useBookingAction,
  useProviderStaff,
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

const mutateMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useBookingAction.mockReturnValue({ mutate: mutateMock, isPending: false });
  useProviderStaff.mockReturnValue({ data: [] });
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
});
