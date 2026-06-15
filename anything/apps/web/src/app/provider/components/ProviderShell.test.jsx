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
});
