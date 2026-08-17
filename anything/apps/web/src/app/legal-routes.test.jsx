import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// The public legal/support pages must render for a LOGGED-OUT visitor with NO
// auth gate and NO redirect. These modules intentionally import no session
// helper (useUser/useNavigate) — so no vi.mock of auth is needed here, and the
// render succeeding IS the proof they're reachable logged-out.
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import EulaPage from "./eula/page";
import SupportPage from "./support/page";

const PAGES = [
  {
    name: "privacy",
    Page: PrivacyPage,
    esTitle: "Política de Privacidad",
    enTitle: "Privacy Policy",
    esBody: /responsable de tus datos/i,
    enBody: /Who is responsible for your data/i,
  },
  {
    name: "terms",
    Page: TermsPage,
    esTitle: "Términos del Servicio",
    enTitle: "Terms of Service",
  },
  {
    name: "eula",
    Page: EulaPage,
    esTitle: "Contrato de Licencia (EULA)",
    enTitle: "End User License Agreement (EULA)",
  },
  {
    name: "support",
    Page: SupportPage,
    esTitle: "Soporte de PawPi",
    enTitle: "PawPi Support",
    esBody: /Cómo contactarnos/i,
    enBody: /Contact us/i,
  },
];

function renderPage(Page, initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Page />
    </MemoryRouter>,
  );
}

describe("public legal/support routes", () => {
  for (const p of PAGES) {
    it(`${p.name}: renders es-AR by default (logged-out, no redirect)`, () => {
      renderPage(p.Page);
      expect(
        screen.getByRole("heading", { level: 1, name: p.esTitle }),
      ).toBeInTheDocument();
      if (p.esBody) expect(screen.getByText(p.esBody)).toBeInTheDocument();
    });

    it(`${p.name}: EN toggle switches the copy to English`, () => {
      renderPage(p.Page);
      // The EN language button lives in the header language group.
      fireEvent.click(screen.getByRole("button", { name: "EN" }));
      expect(
        screen.getByRole("heading", { level: 1, name: p.enTitle }),
      ).toBeInTheDocument();
      if (p.enBody) expect(screen.getByText(p.enBody)).toBeInTheDocument();
    });

    it(`${p.name}: honors ?lang=en on initial load`, () => {
      renderPage(p.Page, "/?lang=en");
      expect(
        screen.getByRole("heading", { level: 1, name: p.enTitle }),
      ).toBeInTheDocument();
    });
  }

  it("renders a branded footer with all four legal cross-links", () => {
    renderPage(PrivacyPage);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Privacidad" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(within(footer).getByRole("link", { name: "Términos" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(within(footer).getByRole("link", { name: "EULA" })).toHaveAttribute(
      "href",
      "/eula",
    );
    expect(within(footer).getByRole("link", { name: "Soporte" })).toHaveAttribute(
      "href",
      "/support",
    );
    // Contact email is the verified, monitored mailbox.
    expect(
      within(footer).getByRole("link", { name: "support@pawpi.info" }),
    ).toHaveAttribute("href", "mailto:support@pawpi.info");
  });
});
