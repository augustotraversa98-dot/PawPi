// enrichment/document — the THIRD enrichment source (Phase 2 ticket 2.82): a provider uploads a
// PDF or Excel/CSV price-list/menu and we PROPOSE a structured services/products catalog they
// review + edit. Lives in the SAME confirm-first seam as the website/Places sources (2.21): this
// module NEVER writes provider data — it only returns a draft. Applying a row routes through the
// EXISTING owner-identity services/products CRUD routes (RLS + validation apply).
//
// Two extraction shapes:
//   - TABULAR (CSV / XLSX): parsed into rows, then mapped to a catalog by plain header heuristics —
//     genuinely useful with NO LLM key (this is the "return only what plain parsing found" path).
//   - TEXT (PDF): parsed to raw text, then STRUCTURED by the LLM (behind ENRICHMENT_LLM_KEY). The
//     default text structurer is a dormant placeholder (mirrors the website source in ./index.js):
//     it proposes nothing rather than inventing data, until a real LLM adapter is injected/wired.
//
// Heavy parsers (papaparse / xlsx / pdfjs-dist) are LAZY-imported inside each extractor so this
// module stays import-safe in CI (tests inject mock extractors and never load them). Every parse is
// wrapped so a malformed file FAILS SOFT — an empty catalog, never a throw to the caller.

import { llmConfig } from "./config";
import { safeFetch } from "./safeFetch";

// --- type detection ----------------------------------------------------------

// Decide the document kind from filename extension first, then mime type. Returns
// 'csv' | 'xlsx' | 'pdf' | 'unknown'.
export function detectDocumentKind({ filename, mimeType } = {}) {
  const name = String(filename || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (name.endsWith(".csv") || mime.includes("csv")) return "csv";
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    return "xlsx";
  }
  if (name.endsWith(".pdf") || mime.includes("pdf")) return "pdf";
  return "unknown";
}

// --- default real extractors (lazy; only loaded at runtime, never in CI) ------

async function toBuffer(file) {
  if (file?.buffer) return file.buffer;
  if (file?.url) {
    // safeFetch: SSRF guard — only the app's storage hosts over https, no private/internal targets,
    // redirects re-validated. See ./safeFetch. A blocked url throws → the caller fails soft (empty).
    const res = await safeFetch(file.url);
    if (!res?.ok) throw new Error(`fetch ${res?.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

async function defaultCsvExtractor(file) {
  const Papa = (await import("papaparse")).default;
  const text = file?.text ?? (await toBuffer(file))?.toString("utf8") ?? "";
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return { rows: Array.isArray(parsed?.data) ? parsed.data : [] };
}

async function defaultXlsxExtractor(file) {
  const XLSX = await import("xlsx");
  const buf = await toBuffer(file);
  const wb = XLSX.read(buf, { type: "buffer" });
  const first = wb.SheetNames?.[0];
  const rows = first ? XLSX.utils.sheet_to_json(wb.Sheets[first]) : [];
  return { rows: Array.isArray(rows) ? rows : [] };
}

async function defaultPdfExtractor(file) {
  // Server-side text extraction via the legacy build (no worker). Best-effort. The specifier is
  // kept in a variable + @vite-ignore so the bundler doesn't try to statically resolve this
  // runtime-only import (it never loads in CI — tests inject a mock pdf extractor).
  const spec = "pdfjs-dist/legacy/build/pdf.js";
  const pdfjs = await import(/* @vite-ignore */ spec);
  const data = new Uint8Array(await toBuffer(file));
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return { text: text.trim() };
}

const DEFAULT_EXTRACTORS = {
  csv: defaultCsvExtractor,
  xlsx: defaultXlsxExtractor,
  pdf: defaultPdfExtractor,
};

// --- tabular rows → catalog (plain parsing, no LLM) --------------------------

// Resolve a row value by trying several header aliases, case-insensitively.
function pick(row, aliases) {
  const keys = Object.keys(row || {});
  for (const alias of aliases) {
    const k = keys.find((key) => key.trim().toLowerCase() === alias);
    if (k != null) {
      const v = row[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return undefined;
}

const NAME_ALIASES = ["name", "title", "item", "service", "product", "treatment"];
const PRICE_ALIASES = ["price", "cost", "amount", "fee", "rate", "$"];
const DURATION_ALIASES = ["duration", "time", "mins", "minutes", "length"];
const DESC_ALIASES = ["description", "desc", "details", "notes", "about"];

// Map parsed rows into { services, products }. A row WITH a duration reads as a service
// (groom/walk/consult slots have durations); otherwise it's a product (a shop item). The provider
// edits/reclassifies everything in the confirm-first panel, so the split is just a sensible default.
export function rowsToCatalog(rows) {
  const services = [];
  const products = [];
  for (const row of rows || []) {
    const name = pick(row, NAME_ALIASES);
    if (!name) continue; // no name → not a usable proposal (no fake data)
    const price = pick(row, PRICE_ALIASES);
    const description = pick(row, DESC_ALIASES);
    const duration = pick(row, DURATION_ALIASES);
    if (duration !== undefined) {
      services.push({ name, price, duration, description });
    } else {
      products.push({ name, price, description });
    }
  }
  return { services, products };
}

// --- text → catalog (LLM-structured; dormant by default) ---------------------

// Structure messy document TEXT into a catalog. The default is DORMANT (returns an empty catalog)
// — mirroring the website source, we propose nothing rather than invent data until a real LLM
// adapter is wired. A caller/test may inject `llm(text) → { services, products }` to exercise the
// seam. Never throws.
export async function structureTextWithLlm(text, { llm } = {}) {
  if (!text || typeof text !== "string") return { services: [], products: [] };
  if (typeof llm === "function") {
    try {
      const out = await llm(text);
      return {
        services: Array.isArray(out?.services) ? out.services : [],
        products: Array.isArray(out?.products) ? out.products : [],
      };
    } catch {
      return { services: [], products: [] };
    }
  }
  // Dormant placeholder: ENRICHMENT_LLM_KEY may be set, but no real text structurer is wired yet.
  return { services: [], products: [] };
}

// --- the adapter -------------------------------------------------------------

/**
 * fetchDocumentCatalog(file, opts) → { services, products }.
 *   file: { filename?, mimeType?, url?, buffer?, text? } — transient extraction input.
 *   opts.extractors: override the per-kind extractor (tests inject mocks).
 *   opts.llm: inject a text→catalog structurer (for PDFs).
 * Best-effort + FAILS SOFT: any parse/extraction error returns an empty catalog, never throws.
 */
export async function fetchDocumentCatalog(file, opts = {}) {
  const empty = { services: [], products: [] };
  if (!file) return empty;
  const kind = detectDocumentKind(file);
  if (kind === "unknown") return empty;

  const extractors = { ...DEFAULT_EXTRACTORS, ...(opts.extractors || {}) };
  let extracted;
  try {
    extracted = await extractors[kind](file);
  } catch {
    return empty; // malformed / unreadable file → empty draft (no throw to the client)
  }

  if (Array.isArray(extracted?.rows) && extracted.rows.length > 0) {
    return rowsToCatalog(extracted.rows);
  }
  if (typeof extracted?.text === "string" && extracted.text.length > 0) {
    return structureTextWithLlm(extracted.text, opts);
  }
  return empty;
}

// The document source is "configured" when the LLM key is present (it's what structures messy docs;
// the FLAG reuses ENRICHMENT_LLM_KEY, already on the go-live list). Tabular files don't strictly
// need it, but we gate the route on it for a clean dormant UX, mirroring 2.21.
export function isDocumentEnrichmentConfigured() {
  return llmConfig() != null;
}
