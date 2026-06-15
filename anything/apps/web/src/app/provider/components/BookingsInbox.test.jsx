import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The screen's data + mutation hooks are mocked so this test isolates rendering,
// the per-status action gating, and the filter wiring (no DB / react-query).
vi.mock("../hooks/useProviders", () => ({
  useProviderBookings: vi.fn(),
  useBookingAction: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useProviderBookings, useBookingAction } from "../hooks/useProviders";
import BookingsInbox from "./BookingsInbox";

const REQUESTED = {
  id: 1,
  appointment_date: "2026-07-01",
  appointment_time: "09:00",
  pet_name: "Rex",
  owner_name: "Sam Owner",
  service_name: "Checkup",
  booking_status: "requested",
  staff_user_id: null,
};
const CONFIRMED = {
  id: 2,
  appointment_date: "2026-07-02",
  appointment_time: "14:30",
  pet_name: "Milo",
  owner_name: "Jo Owner",
  service_name: null,
  booking_status: "confirmed",
  staff_user_id: 42,
};

let mutateMock;

function setBookings(data, extra = {}) {
  useProviderBookings.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateMock = vi.fn();
  useBookingAction.mockReturnValue({
    mutate: mutateMock,
    isPending: false,
    variables: undefined,
  });
  setBookings([REQUESTED, CONFIRMED]);
});

describe("BookingsInbox", () => {
  it("renders a row per booking with pet / owner / service / when", () => {
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Sam Owner")).toBeInTheDocument();
    expect(screen.getByText("Checkup")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01 · 09:00")).toBeInTheDocument();
    // null service_name renders the em-dash fallback.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the empty state when there are no bookings", () => {
    setBookings([]);
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("No bookings yet")).toBeInTheDocument();
  });

  it("shows Confirm only for requested bookings and calls the confirm action", () => {
    render(<BookingsInbox providerId={3} />);
    const confirmButtons = screen.getAllByText("Confirm");
    // Only the requested row (id 1) gets a Confirm button, not the confirmed one.
    expect(confirmButtons).toHaveLength(1);

    fireEvent.click(confirmButtons[0]);
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 1, action: "confirm" }),
      expect.any(Object),
    );
  });

  it("calls the decline action (after confirm dialog) for a requested booking", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BookingsInbox providerId={3} />);
    fireEvent.click(screen.getByText("Decline"));
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 1, action: "decline" }),
      expect.any(Object),
    );
  });

  it("calls the cancel action (after confirm dialog)", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BookingsInbox providerId={3} />);
    // Cancel is available on both rows; click the first.
    fireEvent.click(screen.getAllByText("Cancel")[0]);
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancel" }),
      expect.any(Object),
    );
  });

  it("does NOT call the action when the cancel dialog is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<BookingsInbox providerId={3} />);
    fireEvent.click(screen.getAllByText("Cancel")[0]);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("re-queries with the chosen booking_status when the filter changes", () => {
    render(<BookingsInbox providerId={3} />);
    // Initial render: 'all' → undefined status passed to the query hook.
    expect(useProviderBookings).toHaveBeenLastCalledWith(3, undefined);

    fireEvent.change(screen.getByLabelText("Filter by booking status"), {
      target: { value: "confirmed" },
    });
    expect(useProviderBookings).toHaveBeenLastCalledWith(3, "confirmed");
  });
});
