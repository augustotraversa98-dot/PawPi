// Account-deletion wording (App Store 5.1.1(v)), night run #5 item 2 — docs/delete-account-contributions-options.md, OPTION B.
// The same sentences must reach every place a person can read them, in both languages:
//   • the markdown the public pages render (src/content/legal/*.md) AND the page as rendered,
//   • the docs/legal/ mirrors (privacy-policy, terms-of-service, support.md + support.html),
//   • with the "Last updated" lines of the web file and its mirror agreeing.
// There was no such check before: a page and its mirror could drift silently.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import SupportPage from "./support/page";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const WEB = "anything/apps/web/src/content/legal/";
const DOCS = "docs/legal/";
const norm = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

// Verbatim from docs/delete-account-contributions-options.md (Option B privacy sentence, member part + owner sentence).
const SENTENCES = {
  en: [
    "For dogs that others shared with you, you can choose to delete the posts you published about them. Health logs and vet-record entries you added are part of that dog's care history: they stay with its owner, no longer linked to you and shown as \"Former member\".",
    "If you delete your account and you had shared a dog, the dog and everything recorded about it is deleted, including what the people you shared it with added. We tell them before it happens.",
  ],
  es: [
    "En los perros que otras personas compartieron con vos, podés elegir borrar las publicaciones que hiciste sobre ellos. Los registros de salud y las entradas de la historia clínica que agregaste son parte del historial de cuidado de ese perro: quedan con quien lo tiene a cargo, sin vínculo con vos y como \"Ex integrante\".",
    "Si eliminás tu cuenta y habías compartido un perro, se borra el perro y todo lo registrado sobre él, incluido lo que agregaron las personas con quienes lo compartiste. Les avisamos antes.",
  ],
};

// [name, language, web markdown, mirror files]
const DOCSET = [
  ["privacy", "en", "privacy.en.md", ["privacy-policy.md"]],
  ["privacy", "es", "privacy.es.md", ["privacy-policy.es.md"]],
  ["terms", "en", "terms.en.md", ["terms-of-service.md"]],
  ["terms", "es", "terms.es.md", ["terms-of-service.es.md"]],
  ["support", "en", "support.en.md", ["support.md", "support.html"]],
  ["support", "es", "support.es.md", []],
];
// How many times each document must carry the account-deletion text (privacy: §9 and §11).
const TIMES = { privacy: 2, terms: 1, support: 1 };

const count = (haystack, needle) => haystack.split(needle).length - 1;

describe("deletion wording is in the markdown and in every mirror", () => {
  for (const [name, lang, webFile, mirrors] of DOCSET) {
    for (const file of [WEB + webFile, ...mirrors.map((m) => DOCS + m)]) {
      it(`${file} carries both sentences ${TIMES[name]}x`, () => {
        const text = norm(read(file));
        for (const sentence of SENTENCES[lang]) expect(count(text, sentence)).toBe(TIMES[name]);
      });
    }
  }

  it("never promises that photos are erased", () => {
    for (const [, , webFile, mirrors] of DOCSET) {
      for (const file of [WEB + webFile, ...mirrors.map((m) => DOCS + m)]) {
        expect(read(file), file).not.toMatch(/photos? (are|is|will be) (erased|deleted|removed)|fotos? (se )?(borran|eliminan)/i);
      }
    }
  });
});

describe("the web file and its docs mirror agree", () => {
  const pairs = [
    ["privacy.en.md", "privacy-policy.md"],
    ["privacy.es.md", "privacy-policy.es.md"],
    ["terms.en.md", "terms-of-service.md"],
    ["terms.es.md", "terms-of-service.es.md"],
  ];
  for (const [web, mirror] of pairs) {
    it(`${mirror}: same "Last updated" line and same text as ${web}`, () => {
      const w = read(WEB + web);
      const m = read(DOCS + mirror);
      const dateLine = (s) => s.match(/^\*\*(Last updated|Última actualización):\*\*.*$/m)?.[0];
      expect(dateLine(m)).toBeTruthy();
      expect(dateLine(m)).toBe(dateLine(w));
      // the mirror is the web body plus its own header: every non-empty web line is in the mirror, in order
      const mirrorLines = m.split("\n");
      let from = 0;
      for (const line of w.split("\n").filter((l) => l.trim())) {
        const at = mirrorLines.indexOf(line, from);
        expect(at, `${mirror} is missing or reorders: ${line.slice(0, 80)}`).toBeGreaterThanOrEqual(from);
        from = at + 1;
      }
    });
  }
});

describe("the rendered pages show the sentences", () => {
  const pages = [
    ["privacy", PrivacyPage],
    ["terms", TermsPage],
    ["support", SupportPage],
  ];
  for (const [name, Page] of pages) {
    it(`${name}: Spanish (default) and English`, () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <Page />
        </MemoryRouter>,
      );
      const body = () => norm(document.body.textContent);
      for (const sentence of SENTENCES.es) expect(count(body(), sentence)).toBe(TIMES[name]);
      fireEvent.click(screen.getByRole("button", { name: "EN" }));
      for (const sentence of SENTENCES.en) expect(count(body(), sentence)).toBe(TIMES[name]);
    });
  }
});
