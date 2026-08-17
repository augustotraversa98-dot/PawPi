import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

function renderPage(initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Page />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession = { user: null, loading: false };
});

describe("/ homepage (session-aware, WEB1 PR2)", () => {
  it("logged out: renders the branded es-AR homepage with hero + no redirect", () => {
    renderPage();

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("Tu perro.");
    expect(h1.textContent).toContain("Toda su vida, en un solo lugar.");

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("logged out: App Store CTA is honest 'coming soon' text, NOT a dead link", () => {
    renderPage();
    // The coming-soon copy is present…
    expect(
      screen.getAllByText(/Próximamente en el App Store/).length,
    ).toBeGreaterThan(0);
    // …and there is no App Store link at all (no dead/placeholder link).
    expect(screen.queryByRole("link", { name: /Próximamente|App Store/i })).toBeNull();
  });

  it("logged out: footer carries the four legal cross-links + support email", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    for (const name of ["Privacidad", "Términos", "EULA", "Soporte"]) {
      expect(within(footer).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(
      within(footer).getByRole("link", { name: "augusto@pawpi.info" }),
    ).toHaveAttribute("href", "mailto:augusto@pawpi.info");
  });

  it("logged out: business audiences link to account signup", () => {
    renderPage();
    const join = screen.getByRole("link", { name: "Sumate" });
    expect(join).toHaveAttribute("href", "/account/signup");
  });

  it("EN toggle switches the homepage copy to English", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("Your dog's whole life.");
    expect(screen.getAllByText(/Coming soon on the App Store/).length).toBeGreaterThan(0);
  });

  it("honors ?lang=en on initial load", () => {
    renderPage("/?lang=en");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("Your dog's whole life.");
  });

  it("logged in: redirects to /provider and renders nothing", () => {
    mockSession = { user: { id: "u1" }, loading: false };
    const { container } = renderPage();
    expect(navigateSpy).toHaveBeenCalledWith("/provider");
    expect(container).toBeEmptyDOMElement();
  });

  it("loading: renders nothing (no flash) and does not redirect yet", () => {
    mockSession = { user: null, loading: true };
    const { container } = renderPage();
    expect(container).toBeEmptyDOMElement();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
