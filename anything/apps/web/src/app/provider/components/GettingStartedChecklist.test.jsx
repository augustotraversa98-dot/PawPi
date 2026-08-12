import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// GettingStartedChecklist (ticket 2.99) — the six data hooks + useNavigate are mocked so these
// tests drive the card's rendering/branching directly (derivations + % math are covered in
// lib/activation.test.js).

const navigateMock = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }));
// lucide-react renders fine under jsdom (simple SVGs) — no mock (a Proxy mock is a thenable trap
// that hangs vitest's ESM loader).

vi.mock("../hooks/useProviders", () => ({
  useProvider: vi.fn(),
  useProviderServices: vi.fn(),
  useShopProducts: vi.fn(),
  useAvailabilityWindows: vi.fn(),
  useProviderLocations: vi.fn(),
  useProviderPosts: vi.fn(),
}));

import {
  useProvider,
  useProviderServices,
  useShopProducts,
  useAvailabilityWindows,
  useProviderLocations,
  useProviderPosts,
} from "../hooks/useProviders";
import GettingStartedChecklist from "./GettingStartedChecklist";

function setup({
  provider = { logo_url: "x", bio: "hi" },
  capabilities = [],
  services = [],
  products = [],
  windows = [],
  locations = [],
  posts = [],
} = {}) {
  useProvider.mockReturnValue({ data: { provider, capabilities } });
  useProviderServices.mockReturnValue({ data: services });
  useShopProducts.mockReturnValue({ data: products });
  useAvailabilityWindows.mockReturnValue({ data: { windows } });
  useProviderLocations.mockReturnValue({ data: locations });
  useProviderPosts.mockReturnValue({ data: posts });
}

const fullyDone = {
  provider: { logo_url: "x", bio: "hi" },
  services: [{ id: 1 }],
  windows: [{ id: 1 }],
  locations: [{ id: 1 }],
  posts: [{ id: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockClear();
  localStorage.clear();
});

it("renders the card with a percent badge and all five checklist rows", () => {
  setup({ provider: { logo_url: "x", bio: "hi" }, services: [{ id: 1 }] }); // profile + offering
  render(<GettingStartedChecklist providerId={1} />);
  expect(screen.getByTestId("provider-getting-started")).toBeInTheDocument();
  for (const key of ["profile", "offering", "hours", "location", "post"]) {
    expect(screen.getByTestId(`provider-gs-item-${key}`)).toBeInTheDocument();
  }
  // Done vs undone reflected in the check variant.
  expect(screen.getByTestId("provider-gs-check-profile-done")).toBeInTheDocument();
  expect(screen.getByTestId("provider-gs-check-post")).toBeInTheDocument();
});

it("renders nothing until the provider profile has loaded", () => {
  setup(); // seed the list hooks, then override the provider read as not-yet-loaded
  useProvider.mockReturnValue({ data: undefined });
  render(<GettingStartedChecklist providerId={1} />);
  expect(screen.queryByTestId("provider-getting-started")).toBeNull();
});

it("tapping a row navigates to the screen that completes it", () => {
  setup();
  render(<GettingStartedChecklist providerId={1} />);
  fireEvent.click(screen.getByTestId("provider-gs-item-location"));
  expect(navigateMock).toHaveBeenCalledWith("/provider/locations");
  fireEvent.click(screen.getByTestId("provider-gs-item-offering"));
  expect(navigateMock).toHaveBeenCalledWith("/provider/services");
  fireEvent.click(screen.getByTestId("provider-gs-item-post"));
  expect(navigateMock).toHaveBeenCalledWith("/provider/storefront");
});

it("at 100% (not yet celebrated) shows the celebration, not the checklist", () => {
  setup(fullyDone);
  render(<GettingStartedChecklist providerId={1} />);
  expect(screen.getByTestId("provider-getting-started-celebration")).toBeInTheDocument();
  expect(screen.queryByTestId("provider-getting-started")).toBeNull();
});

it("at 100% AND already celebrated → the card is retired (renders nothing)", () => {
  localStorage.setItem("pawpi:provider:gettingStartedCelebrated:1", "1");
  setup(fullyDone);
  render(<GettingStartedChecklist providerId={1} />);
  expect(screen.queryByTestId("provider-getting-started-celebration")).toBeNull();
  expect(screen.queryByTestId("provider-getting-started")).toBeNull();
});
