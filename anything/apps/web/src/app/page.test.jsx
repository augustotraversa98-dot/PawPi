import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Controllable session state for each case.
let mockSession = { user: null, loading: false };
vi.mock("@/utils/useUser", () => ({
  default: () => mockSession,
}));

// Spy on navigation while keeping the rest of react-router intact (MemoryRouter etc.).
const navigateSpy = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateSpy };
});

import Page from "./page";

function renderPage() {
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession = { user: null, loading: false };
});

describe("/ landing (session-aware)", () => {
  it("logged out: shows landing with exactly Sign in + Create an account, no provider CTA", () => {
    mockSession = { user: null, loading: false };
    renderPage();

    expect(screen.getByText("PawPi for Business")).toBeInTheDocument();

    const signin = screen.getByRole("link", { name: "Sign in" });
    const signup = screen.getByRole("link", { name: "Create an account" });
    expect(signin).toHaveAttribute("href", "/account/signin");
    expect(signup).toHaveAttribute("href", "/account/signup");

    // Only two CTAs; the old "Go to provider area" button is gone.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(
      links.some((l) => l.getAttribute("href") === "/provider"),
    ).toBe(false);

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("logged in: redirects to /provider and never renders the landing", () => {
    mockSession = { user: { id: "u1" }, loading: false };
    const { container } = renderPage();

    expect(navigateSpy).toHaveBeenCalledWith("/provider");
    expect(screen.queryByText("PawPi for Business")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("loading: renders nothing (no flash) and does not redirect yet", () => {
    mockSession = { user: null, loading: true };
    const { container } = renderPage();

    expect(screen.queryByText("PawPi for Business")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
