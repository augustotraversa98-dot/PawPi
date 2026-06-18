import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Public vet card page (ticket 2.51): renders the scoped card without auth; shows a clean
// "link no longer valid" when the API 404s (revoked/expired).

vi.mock("react-router", () => ({ useParams: () => ({ token: "LINK1" }) }));

import PublicVetCardPage from "./page";

function mockFetch(card, ok = true) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve({ card }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public vet card page", () => {
  it("renders the full card with medical details", async () => {
    mockFetch({
      pet: { name: "Rex", breed: "Beagle" },
      microchip_id: "chip-1",
      medical: { blood_type: "DEA 1.1+", allergies: [{ allergen: "Penicillin" }], conditions: [] },
    });
    render(<PublicVetCardPage />);
    expect(await screen.findByText("Rex")).toBeInTheDocument();
    expect(await screen.findByTestId("medical-section")).toBeInTheDocument();
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
  });

  it("shows 'link no longer valid' when the API 404s (revoked/expired)", async () => {
    mockFetch(null, false);
    render(<PublicVetCardPage />);
    expect(await screen.findByTestId("invalid-link")).toBeInTheDocument();
  });
});
