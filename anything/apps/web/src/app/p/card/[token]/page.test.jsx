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

  it.each([
    ["phone", "11 4000-7777", "tel:1140007777"],
    ["email", "ana@example.test", "mailto:ana@example.test"],
  ])("shows the owner %s the family chose, also on a basic link", async (mode, value, href) => {
    mockFetch({ pet: { name: "Rex" }, contact: { mode, value }, medical: null });
    render(<PublicVetCardPage />);
    expect(await screen.findByRole("link", { name: value })).toHaveAttribute("href", href);
    expect(screen.getByTestId("owner-contact")).toBeInTheDocument();
  });

  it.each(["relay", "none"])("shows no owner contact in %s mode", async (mode) => {
    mockFetch({ pet: { name: "Rex" }, contact: { mode, value: "ana@example.test" }, medical: null });
    const { container } = render(<PublicVetCardPage />);
    await screen.findByText("Rex");
    expect(screen.queryByTestId("owner-contact")).toBeNull();
    expect(container.innerHTML).not.toContain("ana@example.test");
  });

  it("makes the emergency and vet phones tappable", async () => {
    mockFetch({
      pet: { name: "Rex" },
      contact: { mode: "relay", value: null },
      medical: { vet_phone: "(011) 4000-7777", emergency_contact_phone: "+54 9 11 6666 0202" },
    });
    render(<PublicVetCardPage />);
    expect(await screen.findByRole("link", { name: "+54 9 11 6666 0202" })).toHaveAttribute("href", "tel:+5491166660202");
    expect(screen.getByRole("link", { name: "(011) 4000-7777" })).toHaveAttribute("href", "tel:01140007777");
  });

  it("shows 'link no longer valid' when the API 404s (revoked/expired)", async () => {
    mockFetch(null, false);
    render(<PublicVetCardPage />);
    expect(await screen.findByTestId("invalid-link")).toBeInTheDocument();
  });
});
