import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// The bookings hook is mocked; react-router's Link is stubbed to an anchor so we
// can assert the deep-link href. The index surfaces NO medical data — only the
// distinct pet names already exposed by bookings, each linking into the gated
// record.
vi.mock("react-router", () => ({
  Link: ({ to, children, ...p }) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("../hooks/useProviders", () => ({
  useProviderBookings: vi.fn(),
  useSharedPets: vi.fn(),
}));

// The invitations block has its own tests (ClinicalShareOffers.test.jsx); here only that it is on the screen.
vi.mock("./ClinicalShareOffers", () => ({
  default: ({ providerId }) => <div data-testid="share-offers">{providerId}</div>,
}));

import { useProviderBookings, useSharedPets } from "../hooks/useProviders";
import ProviderClinical from "./ProviderClinical";

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
  useSharedPets.mockReturnValue({ data: [] });
});

describe("ProviderClinical index", () => {
  it("lists DISTINCT pets from bookings, linking into each gated record", () => {
    setBookings([
      { id: 1, pet_id: 55, pet_name: "Rex" },
      { id: 2, pet_id: 55, pet_name: "Rex" }, // dup pet → one row
      { id: 3, pet_id: 77, pet_name: "Milo" },
    ]);
    render(<ProviderClinical providerId={3} />);

    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Milo")).toBeInTheDocument();
    // Two distinct pets → two record links.
    const links = screen.getAllByRole("link", { name: /open record/i });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toContain("/provider/pets/55/record");
    expect(links[0].getAttribute("href")).toContain("petName=Rex");
  });

  it("shows this business's invitations", () => {
    setBookings([]);
    render(<ProviderClinical providerId={3} />);
    expect(screen.getByTestId("share-offers")).toHaveTextContent("3");
  });

  it("lists pets shared without a booking, linking into the gated record", () => {
    setBookings([]);
    useSharedPets.mockReturnValue({
      data: [{ pet_id: 88, pet_name: "Nina & Co", expires_at: null }],
    });
    render(<ProviderClinical providerId={3} />);

    expect(screen.getByRole("region", { name: /shared with us|compartidas con nosotros/i })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /nina & co/i });
    expect(link.getAttribute("href")).toBe("/provider/pets/88/record?petName=Nina+%26+Co");
    expect(useSharedPets).toHaveBeenCalledWith(3);
  });

  it("shows no shared section while nothing is shared", () => {
    setBookings([]);
    render(<ProviderClinical providerId={3} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no bookings", () => {
    setBookings([]);
    render(<ProviderClinical providerId={3} />);
    expect(screen.getByText("No pets yet")).toBeInTheDocument();
  });
});
