// TEMPORARY company identity on the legal pages (docs/legal/TEMP-company-identity-revert.md; delete this file on revert).
// The company name and NIF must be in the controller block and on the other legal surfaces, in both languages.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import SupportPage from "./support/page";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const WEB = "anything/apps/web/src/content/legal/";
const DOCS = "docs/legal/";

const NAME = "Tanquetats 2022";
const NIF = "B10579803";
const ADDRESS = "Calle Torrente 18 26, 46014 Valencia, Spain";
const OLD = /Augusto Traversa|Matacos/;

// The text of one numbered section: from its "## n." heading up to the next "## " heading.
const section = (text, n) => text.split(/^(?=## )/m).find((part) => part.startsWith(`## ${n}.`)) ?? "";

describe("privacy §1 names the company as controller", () => {
  it.each([
    WEB + "privacy.en.md",
    WEB + "privacy.es.md",
    DOCS + "privacy-policy.md",
    DOCS + "privacy-policy.es.md",
  ])("%s", (file) => {
    const block = section(read(file), 1);
    for (const value of [NAME, NIF, ADDRESS, "support@pawpi.info"]) expect(block).toContain(value);
  });
});

describe("terms §17 legal notice identifies the company", () => {
  it.each([
    WEB + "terms.en.md",
    WEB + "terms.es.md",
    DOCS + "terms-of-service.md",
    DOCS + "terms-of-service.es.md",
  ])("%s", (file) => {
    const block = section(read(file), 17);
    for (const value of [NAME, NIF, ADDRESS, "support@pawpi.info"]) expect(block).toContain(value);
  });
});

describe("Terms and EULA agree on Spanish law", () => {
  it.each([
    WEB + "terms.en.md",
    WEB + "terms.es.md",
    DOCS + "terms-of-service.md",
    DOCS + "terms-of-service.es.md",
    WEB + "eula.en.md",
    WEB + "eula.es.md",
  ])("%s", (file) => {
    const text = read(file).replace(/\s+/g, " ");
    expect(text).toMatch(/Spanish law|ley española/);
    expect(text).not.toMatch(/laws of Argentina|leyes de (la República )?Argentina|(Governing law|Ley aplicable): Argentina|Buenos Aires/);
  });
});

describe("served pages", () => {
  const PAGES = [
    ["/privacy", PrivacyPage],
    ["/terms", TermsPage],
    ["/support", SupportPage],
  ];

  describe.each([
    ["es", ""],
    ["en", "?lang=en"],
  ])("%s", (_lang, search) => {
    it.each(PAGES)("%s shows the company, NIF and address, and not the old identity", (route, Page) => {
      render(
        <MemoryRouter initialEntries={[`${route}${search}`]}>
          <Page />
        </MemoryRouter>,
      );
      const text = document.body.textContent;
      for (const value of [NAME, NIF, ADDRESS]) expect(text).toContain(value);
      expect(text).not.toMatch(OLD);
      expect(screen.getByRole("contentinfo").textContent).toContain(`© 2026 PawPi · ${NAME}`);
    });
  });
});
