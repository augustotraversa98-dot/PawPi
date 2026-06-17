import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ProviderDashboard (ticket 2.14) — the at-a-glance business overview. The analytics hook is
// mocked; recharts is stubbed (jsdom has no layout) so we isolate: the headline stats render the
// scoped metrics, the upcoming-bookings list renders, and an all-empty summary shows empty
// states (no fake metrics).

const navigateMock = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }));

// Stub recharts to inert divs — its SVG layout doesn't render under jsdom.
vi.mock("../../../client-integrations/recharts", () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Stub,
    BarChart: Stub,
    Bar: Stub,
    LineChart: Stub,
    Line: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    CartesianGrid: Stub,
  };
});

vi.mock("../hooks/useProviders", () => ({ useProviderAnalytics: vi.fn() }));

import { useProviderAnalytics } from "../hooks/useProviders";
import ProviderDashboard from "./ProviderDashboard";

const FULL = {
  provider_id: 100,
  revenue: {
    total_cents: 1500000,
    paid_order_count: 12,
    currency: "ARS",
    by_month: [{ month: "2026-06", revenue_cents: 1500000, order_count: 12 }],
  },
  bookings: {
    total: 30,
    upcoming_count: 4,
    by_month: [{ month: "2026-06", booking_count: 30 }],
    upcoming: [
      {
        id: 9,
        pet_name: "Rex",
        owner_name: "Jane Doe",
        service_name: "Grooming",
        appointment_date: "2026-07-01",
        appointment_time: "09:00",
        booking_status: "confirmed",
      },
    ],
  },
  occupancy: { on_site: 3, booked_ahead: 7 },
  rating: { review_count: 8, avg_rating: 4.5 },
  top_services: [{ service_id: 1, service_name: "Grooming", booking_count: 30 }],
};

const EMPTY = {
  provider_id: 100,
  revenue: { total_cents: 0, paid_order_count: 0, currency: "ARS", by_month: [] },
  bookings: { total: 0, upcoming_count: 0, by_month: [], upcoming: [] },
  occupancy: { on_site: 0, booked_ahead: 0 },
  rating: { review_count: 0, avg_rating: 0 },
  top_services: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProviderDashboard", () => {
  it("renders the scoped headline metrics + upcoming bookings", () => {
    useProviderAnalytics.mockReturnValue({ data: FULL, isLoading: false, isError: false });
    render(<ProviderDashboard providerId={100} />);

    // revenue formatted in the provider's currency
    expect(screen.getByText(/ARS 15,000\.00/)).toBeTruthy();
    expect(screen.getByText("12 paid orders")).toBeTruthy();
    // bookings + occupancy + rating
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("4 upcoming")).toBeTruthy();
    expect(screen.getByText("7 booked ahead")).toBeTruthy();
    expect(screen.getByText("4.50")).toBeTruthy();
    // upcoming list
    expect(screen.getByText(/Rex/)).toBeTruthy();
    expect(screen.getByText(/Grooming · 2026-07-01 · 09:00/)).toBeTruthy();
  });

  it("shows empty states when there is no data (no fake metrics)", () => {
    useProviderAnalytics.mockReturnValue({ data: EMPTY, isLoading: false, isError: false });
    render(<ProviderDashboard providerId={100} />);

    expect(screen.getByText("No paid orders yet.")).toBeTruthy();
    expect(screen.getByText("No bookings yet.")).toBeTruthy();
    expect(screen.getByText("No service bookings yet.")).toBeTruthy();
    expect(screen.getByText("No upcoming bookings.")).toBeTruthy();
    // rating with zero reviews shows an em-dash, not 0.00
    expect(screen.getByText("0 reviews")).toBeTruthy();
  });

  it("renders a loading spinner while fetching", () => {
    useProviderAnalytics.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<ProviderDashboard providerId={100} />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
});
