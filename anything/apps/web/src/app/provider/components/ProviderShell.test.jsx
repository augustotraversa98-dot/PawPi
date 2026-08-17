import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Every capability — a provider holding all of these sees every nav section.
const ALL_CAPS = [
  "vet",
  "telehealth",
  "groomer",
  "walker",
  "sitter",
  "daycare",
  "trainer",
  "shop",
  "pharmacy",
  "adoption",
  "transport",
  "insurance",
];

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

  it("renders all 18 nav items, still one flat set of links", async () => {
    // A provider holding every capability sees every section (nothing filtered out).
    mockProviders([
      { id: 1, name: "Happy Paws", provider_type: "vet", capabilities: ALL_CAPS },
    ]);
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
      "Calendar import",
      "Storefront",
      "Services",
      "Products",
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
    // A vet is bookable and holds the vet capability → all four group headers appear.
    mockProviders([
      { id: 1, name: "Happy Paws", provider_type: "vet", capabilities: ["vet"] },
    ]);
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

  it("a shop-only provider sees the always-on set + Shop, and NO Care/Schedule modules", async () => {
    mockProviders([
      { id: 1, name: "Corner Pet Shop", provider_type: "shop", capabilities: ["shop"] },
    ]);
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    await screen.findByText("Corner Pet Shop");

    // Always-on sections + Shop (its 'shop' capability) are shown.
    for (const label of [
      "Dashboard",
      "Chats",
      "Storefront",
      "Products",
      "Profile",
      "Staff",
      "Sales",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }

    // No bookable (Schedule + Services + Locations) and no other Care module.
    for (const label of [
      "Bookings",
      "Calendar",
      "Calendar import",
      "Services",
      "Locations",
      "Clinical",
      "Daycare",
      "Training",
      "Adoption",
      "Rx Fulfillment",
      "Policies",
    ]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }

    // A group with no visible items drops its header; Store/Business remain.
    expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
    expect(screen.queryByText("Care")).not.toBeInTheDocument();
    expect(screen.getByText("Store")).toBeInTheDocument();
    expect(screen.getByText("Business")).toBeInTheDocument();
  });

  it("a vet provider sees the Schedule group + Clinical (bookable + vet)", async () => {
    mockProviders([
      { id: 1, name: "Vet Co", provider_type: "vet", capabilities: ["vet"] },
    ]);
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    await screen.findByText("Vet Co");

    for (const label of [
      "Bookings",
      "Calendar",
      "Calendar import",
      "Services",
      "Locations",
      "Clinical",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    // The Products page needs the 'shop' capability, which a vet-only provider lacks.
    expect(screen.queryByRole("link", { name: "Products" })).not.toBeInTheDocument();
  });

  it("lists ONLY selected offerings — no 'Show all sections' escape hatch (2.96)", async () => {
    // Northside offers a store but NOT pharmacy — its Rx Fulfillment section must be
    // absent, and there must be no control that reveals unselected offerings.
    mockProviders([
      { id: 1, name: "Corner Pet Shop", provider_type: "shop", capabilities: ["shop"] },
    ]);
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    await screen.findByText("Corner Pet Shop");

    // Unselected capability sections are not listed...
    expect(screen.queryByRole("link", { name: "Rx Fulfillment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clinical" })).not.toBeInTheDocument();
    // ...and there is NO escape hatch to reveal them.
    expect(
      screen.queryByRole("button", { name: "Show all sections" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show fewer sections" }),
    ).not.toBeInTheDocument();

    // Structural (non-offering) sections always show.
    for (const label of ["Dashboard", "Chats", "Storefront", "Profile", "Staff", "Sales"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("selecting an offering makes its section appear (capability-driven, 2.96)", async () => {
    // The SAME provider, now with the pharmacy offering selected → Rx Fulfillment lists.
    mockProviders([
      {
        id: 1,
        name: "MediPet",
        provider_type: "pharmacy",
        capabilities: ["shop", "pharmacy"],
      },
    ]);
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    await screen.findByText("MediPet");

    expect(screen.getByRole("link", { name: "Rx Fulfillment" })).toBeInTheDocument();
    // Still no escape hatch — the section appears because the offering is selected.
    expect(
      screen.queryByRole("button", { name: "Show all sections" }),
    ).not.toBeInTheDocument();
  });
});

// MOD2 PR2 — the admin moderation entry point. URL-aware fetch so the moderation-summary probe
// can answer independently of the providers/invites reads.
function mockWith({ providers = [], summary = { is_admin: false, open_count: 0 } }) {
  global.fetch = vi.fn().mockImplementation((url) => {
    let body;
    if (url.includes("/api/admin/moderation-summary")) body = summary;
    else if (url.includes("/api/provider-invites")) body = { invites: [] };
    else body = { providers };
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  });
}

describe("ProviderShell — admin moderation entry point (MOD2 PR2)", () => {
  it("an admin with a provider sees a Moderation nav link with the open-count badge", async () => {
    mockWith({
      providers: [{ id: 1, name: "Happy Paws", provider_type: "vet", capabilities: ["vet"] }],
      summary: { is_admin: true, open_count: 4 },
    });
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    await screen.findByText("Happy Paws");

    const link = await screen.findByRole("link", { name: /moderation/i });
    expect(link).toHaveAttribute("href", "/admin/moderation");
    // open-count badge
    expect(screen.getByLabelText("4 open reports")).toHaveTextContent("4");
  });

  it("a NON-admin sees no Moderation link", async () => {
    mockWith({
      providers: [{ id: 1, name: "Happy Paws", provider_type: "vet", capabilities: ["vet"] }],
      summary: { is_admin: false, open_count: 0 },
    });
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    await screen.findByText("Happy Paws");
    expect(screen.queryByRole("link", { name: /moderation/i })).not.toBeInTheDocument();
  });

  it("an admin with NO provider is offered the console instead of being forced into business setup", async () => {
    mockWith({ providers: [], summary: { is_admin: true, open_count: 2 } });
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    // the prominent admin card links to the console...
    const link = await screen.findByRole("link", { name: /you're an admin/i });
    expect(link).toHaveAttribute("href", "/admin/moderation");
    // ...and the create-provider onboarding is still available below (not forced, but not removed)
    expect(screen.getByText("Create your provider")).toBeInTheDocument();
  });

  it("a non-admin with NO provider sees only the normal onboarding (no admin card)", async () => {
    mockWith({ providers: [], summary: { is_admin: false, open_count: 0 } });
    render(
      <MemoryRouter>
        <ProviderShell active="dashboard">{() => <div />}</ProviderShell>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Create your provider")).toBeInTheDocument();
    expect(screen.queryByText(/you're an admin/i)).not.toBeInTheDocument();
  });
});
