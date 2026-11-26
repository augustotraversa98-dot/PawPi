import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// The private-link pet pages in Spanish and English: the browser's language picks, the toggle switches, and no
// word of the other language is left behind.

vi.mock("react-router", () => ({ useParams: () => ({ token: "TOKEN1" }) }));

import PublicTagPage from "./tag/[token]/page";
import PublicVetCardPage from "./card/[token]/page";
import { PET_PAGE_COPY } from "@/lib/publicPet/copy";

const medical = {
  blood_type: "DEA 1.1+",
  spayed_neutered_status: "Neutered",
  allergies: [{ allergen: "Penicilina" }],
  conditions: [],
  medical_notes: null,
};
const TAG = {
  pet: { name: "Busdy", breed: "Beagle", species: "dog" },
  microchip_id: null,
  contact: { mode: "relay", value: null },
  lost: { active: true, reward: "$& 100", last_seen_area: "Plaza" },
  medical,
};
const CARD = { pet: TAG.pet, microchip_id: "chip-1", medical };

const respond = (card, ok = true) => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve({ card }) }),
  );
};
const browserSpeaks = (...languages) => {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);
};

beforeEach(() => {
  window.history.replaceState(null, "", "/p/tag/TOKEN1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Every English string that must not appear on a Spanish page.
function englishStrings(obj, out = []) {
  for (const v of Object.values(obj)) {
    if (typeof v === "object") englishStrings(v, out);
    else if (v.length > 3 && !v.includes("{")) out.push(v);
  }
  return out;
}
const ENGLISH = [
  ...englishStrings(PET_PAGE_COPY.en).filter((s) => s !== "Microchip"), // same word in Spanish
  "Reward:",
  "Last seen:",
  "dog",
];
// Every text node on its own (textContent would glue neighbouring words together), plus the attributes people read.
function visibleStrings() {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) out.push(walker.currentNode.nodeValue);
  for (const el of document.querySelectorAll("[placeholder], [alt], [aria-label]")) {
    for (const name of ["placeholder", "alt", "aria-label"]) out.push(el.getAttribute(name) || "");
  }
  return out;
}
function expectNoEnglish() {
  const visible = visibleStrings().join(" | ");
  // "Pet" and friends can sit inside Spanish words, so match whole phrases on word boundaries.
  for (const phrase of ENGLISH) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(visible, phrase).not.toMatch(new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "u"));
  }
}

describe("tag page language", () => {
  it("opens in Spanish for an es-* browser, with every string translated", async () => {
    browserSpeaks("es-AR", "en");
    respond(TAG);
    render(<PublicTagPage />);
    expect(await screen.findByText("Este perro tiene familia 💛")).toBeInTheDocument();
    expect(screen.getByTestId("lost-banner")).toHaveTextContent(
      "Esta mascota está reportada como PERDIDA · Recompensa: $& 100 · Vista por última vez: Plaza",
    );
    expect(screen.getByText("Perro")).toBeInTheDocument();
    expect(screen.getByText("Castrado")).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje para su familia")).toBe(screen.getByTestId("relay-message"));
    expect(screen.getByText(PET_PAGE_COPY.es.tag.relayHint)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es-AR");
    expect(document.title).toBe("Chapa de mascota · PawPi");
    expectNoEnglish();
  });

  it("switches language from the toggle and keeps the choice in the address", async () => {
    browserSpeaks("es-AR");
    respond(TAG);
    render(<PublicTagPage />);
    await screen.findByText("Este perro tiene familia 💛");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByText("This dog has a home 💛")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?lang=en");
    expect(document.documentElement.lang).toBe("en");
    expect(global.fetch).toHaveBeenCalledTimes(1); // switching language re-reads nothing
  });

  it("opens in English for any other browser", async () => {
    browserSpeaks("pt-BR");
    respond(TAG);
    render(<PublicTagPage />);
    expect(await screen.findByText("This dog has a home 💛")).toBeInTheDocument();
    expect(screen.getByText(PET_PAGE_COPY.en.tag.relayHint)).toBeInTheDocument();
  });

  it("asks for a contact, then acknowledges a sent message, in Spanish", async () => {
    browserSpeaks("es");
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ card: TAG, ok: true }) }),
    );
    render(<PublicTagPage />);
    await screen.findByText("Busdy");
    fireEvent.click(screen.getByTestId("relay-send"));
    expect(screen.getByRole("alert")).toHaveTextContent("Para que puedan contactarte, dejá un teléfono o un email.");
    expectNoEnglish();
    fireEvent.change(screen.getByLabelText("Tu teléfono"), { target: { value: "11 5555 0101" } });
    fireEvent.click(screen.getByTestId("relay-send"));
    expect(await screen.findByText("Gracias: ya avisamos a su familia.")).toBeInTheDocument();
  });

  it.each([
    ["phone", "11 5555", "Llamar a su familia"],
    ["email", "a@example.test", "Escribir un email a su familia"],
  ])("labels the %s button in Spanish", async (mode, value, label) => {
    browserSpeaks("es-AR");
    respond({ ...TAG, contact: { mode, value } });
    render(<PublicTagPage />);
    expect(await screen.findByRole("link", { name: label })).toBeInTheDocument();
    expectNoEnglish();
  });

  it("shows the inactive-tag message in Spanish", async () => {
    browserSpeaks("es-AR");
    respond(null, false);
    render(<PublicTagPage />);
    expect(await screen.findByText("Chapa no activa")).toBeInTheDocument();
    expectNoEnglish();
  });
});

describe("vet card page language", () => {
  it("renders the full card in Spanish", async () => {
    browserSpeaks("es-AR");
    respond(CARD);
    render(<PublicVetCardPage />);
    expect(await screen.findByText("Datos médicos")).toBeInTheDocument();
    expect(screen.getByText("Tarjeta de emergencia")).toBeInTheDocument();
    expect(screen.getByText("Penicilina")).toBeInTheDocument();
    expectNoEnglish();
  });

  it("renders the basic card and the dead link in Spanish", async () => {
    browserSpeaks("es-AR");
    respond({ ...CARD, medical: null });
    render(<PublicVetCardPage />);
    expect(await screen.findByText("Este es un enlace básico (sin datos médicos).")).toBeInTheDocument();
    expectNoEnglish();
    cleanup();
    respond(null, false);
    render(<PublicVetCardPage />);
    expect(await screen.findByText("El enlace ya no es válido")).toBeInTheDocument();
    expectNoEnglish();
  });

  it("honours ?lang=en over a Spanish browser", async () => {
    browserSpeaks("es-AR");
    window.history.replaceState(null, "", "/p/card/TOKEN1?lang=en");
    respond(CARD);
    render(<PublicVetCardPage />);
    expect(await screen.findByText("Medical")).toBeInTheDocument();
  });
});
