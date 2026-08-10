import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Authenticated user for every case here (the auth-redirect path is its own
// concern). GET /api/providers is mocked at the fetch boundary.
vi.mock("@/utils/useUser", () => ({
  default: () => ({ user: { id: "u1" }, loading: false }),
}));

import ProviderShell from "./ProviderShell";
import { getProviderQueryClient } from "../lib/queryClient";

function mockProviders(list) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ providers: list }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The provider area uses a singleton QueryClient — clear its cache so each
  // case re-fetches against its own mocked providers list.
  getProviderQueryClient().clear();
  localStorage.clear();
});

describe("ProviderShell foundation", () => {
  it("renders the onboarding create form when the user is staff of none", async () => {
    mockProviders([]);
    render(
      <MemoryRouter>
        <ProviderShell active="bookings">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Create your provider"),
    ).toBeInTheDocument();
  });

  it("in the no-provider state, shows the pending-invites pointer when the user has invites", async () => {
    // URL-aware: the providers list is empty (staff of none) but the invites
    // read returns one pending invite — the discovery banner must appear.
    global.fetch = vi.fn().mockImplementation((url) => {
      const body = url.includes("/api/provider-invites")
        ? { invites: [{ id: 5, provider_id: 100, provider_name: "Happy Paws" }] }
        : { providers: [] };
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });

    render(
      <MemoryRouter>
        <ProviderShell active="bookings">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("You have 1 pending invitation"),
    ).toBeInTheDocument();
    // The create-your-provider onboarding is still offered alongside it.
    expect(screen.getByText("Create your provider")).toBeInTheDocument();
  });

  it("in the no-provider state, shows NO invites pointer when there are none", async () => {
    mockProviders([]); // every fetch returns { providers: [] } → invites read = []
    render(
      <MemoryRouter>
        <ProviderShell active="bookings">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Create your provider")).toBeInTheDocument();
    expect(screen.queryByText(/pending invitation/i)).not.toBeInTheDocument();
  });

  it("renders the shell, nav, and provider name for one provider, passing the id to children", async () => {
    mockProviders([{ id: 1, name: "Happy Paws", provider_type: "vet" }]);
    render(
      <MemoryRouter>
        <ProviderShell active="bookings">
          {(providerId) => <div>active:{String(providerId)}</div>}
        </ProviderShell>
      </MemoryRouter>,
    );

    // provider context resolved + rendered
    expect(await screen.findByText("Happy Paws")).toBeInTheDocument();
    // shell chrome
    expect(screen.getByText("PawPi Provider")).toBeInTheDocument();
    expect(screen.getByText("Bookings")).toBeInTheDocument();
    // render-prop received the resolved active provider id
    expect(screen.getByText("active:1")).toBeInTheDocument();
  });

  it("renders all 19 nav items, still one flat set of links", async () => {
    mockProviders([{ id: 1, name: "Happy Paws", provider_type: "vet" }]);
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    await screen.findByText("Happy Paws");

    // Every section is still present and reachable — nothing was hidden by the
    // Phase 1 grouping (purely presentational).
    const labels = [
      "Dashboard",
      "Chats",
      "Bookings",
      "Calendar",
      "Availability",
      "Calendar import",
      "Storefront",
      "Services",
      "Shop",
      "Locations",
      "Clinical",
      "Daycare",
      "Training",
      "Adoption",
      "Rx Fulfillment",
      "Policies",
      "Profile",
      "Staff",
      "Sales",
    ];
    for (const label of labels) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link")).toHaveLength(labels.length);
  });

  it("renders the group headers in order and marks the active item", async () => {
    mockProviders([{ id: 1, name: "Happy Paws", provider_type: "vet" }]);
    render(
      <MemoryRouter>
        <ProviderShell active="clinical">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    await screen.findByText("Happy Paws");

    // Group headers present (Dashboard + Chats sit in the headerless top group).
    for (const header of ["Schedule", "Store", "Care", "Business"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }

    // The active key is highlighted via aria-current on its link.
    expect(screen.getByRole("link", { name: "Clinical" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Bookings" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
