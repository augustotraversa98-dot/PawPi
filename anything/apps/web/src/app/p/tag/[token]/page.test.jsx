import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Public tag page (ticket 2.51): renders WITHOUT auth from the whitelisted payload, shows medical
// ONLY when present, surfaces a LOST banner, and relays a message in relay mode.

vi.mock("react-router", () => ({ useParams: () => ({ token: "TAG1" }) }));

import PublicTagPage from "./page";

function mockFetch(card, ok = true) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve({ card }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public tag page", () => {
  it("renders basic info and NO medical section when medical is absent", async () => {
    mockFetch({
      pet: { name: "Rex", breed: "Beagle", species: "dog" },
      microchip_id: "chip-1",
      contact: { mode: "relay", value: null },
      lost: null,
      medical: null,
    });
    render(<PublicTagPage />);
    expect(await screen.findByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("This dog has a home 💛")).toBeInTheDocument();
    expect(screen.queryByTestId("medical-section")).toBeNull();
  });

  it("shows the medical section when the owner enabled it", async () => {
    mockFetch({
      pet: { name: "Rex" },
      microchip_id: "chip-1",
      contact: { mode: "relay", value: null },
      lost: null,
      medical: { blood_type: "DEA 1.1+", allergies: [{ allergen: "Penicillin" }], conditions: [] },
    });
    render(<PublicTagPage />);
    expect(await screen.findByTestId("medical-section")).toBeInTheDocument();
    expect(screen.getByText("DEA 1.1+")).toBeInTheDocument();
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
  });

  it("shows a LOST banner when an active lost report exists", async () => {
    mockFetch({
      pet: { name: "Rex" },
      contact: { mode: "none" },
      lost: { active: true, reward: "$100", last_seen_area: "Park" },
      medical: null,
    });
    render(<PublicTagPage />);
    expect(await screen.findByTestId("lost-banner")).toHaveTextContent(/LOST/);
  });

  it("relay mode posts the message to the contact endpoint", async () => {
    mockFetch({ pet: { name: "Rex" }, contact: { mode: "relay", value: null }, lost: null, medical: null });
    render(<PublicTagPage />);
    await screen.findByText("Rex");
    fireEvent.change(screen.getByTestId("relay-message"), { target: { value: "found him!" } });
    fireEvent.click(screen.getByTestId("relay-send"));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/public/emergency/tag/TAG1/contact",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(await screen.findByTestId("relay-sent")).toBeInTheDocument();
  });

  it("shows 'tag not active' when the API 404s", async () => {
    mockFetch(null, false);
    render(<PublicTagPage />);
    expect(await screen.findByText("Tag not active")).toBeInTheDocument();
  });
});
