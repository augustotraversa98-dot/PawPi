// enrichment/petRecords — AI-1 (night-run 2026-08-18d): read a STORED pet document (photo or PDF)
// with Claude vision and PROPOSE a structured record set the owner can review before anything is
// written. Lives in the SAME confirm-first seam as the business enrichment sources (2.21/2.82):
// this module NEVER writes pet data — it only returns a draft. Applying a proposed row routes
// through the EXISTING VR-B add routes (owner-OR-Editor gate + 0120 attribution apply there).
//
// Design (Cowork decisions):
//   - AI = Claude / Anthropic vision (reads images AND PDFs), structured JSON via a forced tool call.
//   - Gated behind ANTHROPIC_API_KEY: unset → EnrichmentNotConfiguredError (the route maps it to a
//     clean 503). The feature is dormant until Tats sets the key on Railway.
//   - No invented data: the prompt extracts ONLY what is clearly present; dates are YYYY-MM-DD or
//     null. The normalizer drops any proposed row missing its identifying field.
//   - FAIL SOFT: an unreadable file, an oversized file, a model/parse error → an EMPTY proposal
//     ({ docType:'other', records:{} }), never a throw to the caller (the file is still stored).
//   - Bound cost/latency: one model call, a hard byte cap, and request timeouts.
//
// The heavy work (fetch + model call) is injectable via opts so tests never hit the network in CI.

import { anthropicConfig, EnrichmentNotConfiguredError } from "./config";

// Anthropic base64 request/document limit is 32MB; refuse anything larger up front (fail soft).
const MAX_BYTES = 32 * 1024 * 1024;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// --- media detection ---------------------------------------------------------

// Decide how to send the file to the model: an Anthropic "image" block for photos, a "document"
// (PDF) block for PDFs. Returns { kind: 'image'|'pdf', mediaType } or null for unsupported types.
export function detectMedia({ filename, mimeType } = {}) {
  const name = String(filename || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (name.endsWith(".pdf") || mime.includes("pdf")) {
    return { kind: "pdf", mediaType: "application/pdf" };
  }
  if (name.endsWith(".png") || mime.includes("png")) {
    return { kind: "image", mediaType: "image/png" };
  }
  if (name.endsWith(".webp") || mime.includes("webp")) {
    return { kind: "image", mediaType: "image/webp" };
  }
  if (name.endsWith(".gif") || mime.includes("gif")) {
    return { kind: "image", mediaType: "image/gif" };
  }
  if (name.endsWith(".heic") || name.endsWith(".heif") || mime.includes("heic") || mime.includes("heif")) {
    // Anthropic vision doesn't natively read HEIC; sending it may fail → we fail soft to an empty
    // proposal. Mobile capture generally yields jpg, so this is a rare edge.
    return { kind: "image", mediaType: "image/heic" };
  }
  if (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    mime.includes("jpeg") ||
    mime.includes("jpg") ||
    mime.includes("image/")
  ) {
    return { kind: "image", mediaType: "image/jpeg" };
  }
  return null;
}

// --- transient fetch ---------------------------------------------------------

// Fetch the stored file as transient bytes. Best-effort with a hard size cap + timeout; throws on
// any problem so the caller can fail soft. (Overridable in tests via opts.fetchBytes.)
async function defaultFetchBytes(url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!res?.ok) throw new Error(`fetch ${res?.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("empty file");
  if (buf.length > MAX_BYTES) throw new Error("file too large");
  return buf;
}

// --- the structured-output tool ---------------------------------------------

// The tool schema uses the EXACT camelCase field names the VR-B add routes accept, so a proposed
// row is applied by AI-2 with a trivial POST (no field translation). Kept flat + string-typed to
// stay within structured-output schema limits.
const PROP = (props) => ({ type: "object", properties: props });
const S = { type: "string" };
const ARR = (props) => ({ type: "array", items: PROP(props) });

const EXTRACT_TOOL = {
  name: "record_pet_document",
  description:
    "Return the structured medical records clearly present in the pet document. Extract ONLY what " +
    "is actually written — never invent a date, dose, or name. Use null for anything not present.",
  input_schema: PROP({
    docType: {
      type: "string",
      description: "vaccination_card | lab_report | prescription | surgery_report | visit_summary | invoice | other",
    },
    records: PROP({
      vaccinations: ARR({ name: S, dateGiven: S, expiresOn: S, clinicName: S, notes: S }),
      medications: ARR({ name: S, dose: S, frequency: S, prescribedBy: S, startDate: S, notes: S }),
      surgeries: ARR({ procedure: S, surgeryDate: S, surgeon: S, clinic: S, notes: S }),
      labResults: ARR({ testName: S, testDate: S, results: S, orderedBy: S, notes: S }),
      allergies: ARR({ allergen: S, severity: S, reaction: S, diagnosedDate: S, notes: S }),
      conditions: ARR({ condition: S, status: S, diagnosedDate: S, notes: S }),
      visitNotes: ARR({ vetName: S, noteDate: S, note: S }),
    }),
  }),
};

const PROMPT =
  "You are reading a pet's veterinary document (it may be a photo or a scanned PDF). Extract ONLY " +
  "the records that are clearly present in the document. Never guess or invent a value — if a date, " +
  "dose, clinic, or name is not written, leave it out (use null). Dates must be ISO YYYY-MM-DD or " +
  "null. For lab results, put the measured value, its unit, and any reference range together in the " +
  "'results' field. Call the record_pet_document tool exactly once with everything you found.";

// --- the model call ----------------------------------------------------------

// Send one image OR document block to the Anthropic Messages API and return the forced tool input
// (the structured proposal). Thinking is disabled so the forced tool_choice is accepted and the
// call stays fast/cheap. Throws on any HTTP/parse problem (caller fails soft). Overridable in tests.
async function defaultCallModel({ apiKey, model, block }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      thinking: { type: "disabled" },
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
    }),
  });
  if (!res?.ok) throw new Error(`anthropic ${res?.status}`);
  const data = await res.json();
  const toolBlock = (data?.content || []).find((b) => b?.type === "tool_use");
  return toolBlock?.input ?? {};
}

// --- normalization (no invented data) ---------------------------------------

const clean = (v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" ? undefined : s;
};

// Map + validate each proposed row: coerce to trimmed strings and DROP any row missing its
// identifying field (so an empty/garbage row never becomes a proposal). Every surviving row is
// already in the shape the matching VR-B add route accepts.
function normalizeRecords(records = {}) {
  const out = {};
  const pushIf = (key, rows, keyField, map) => {
    const list = (Array.isArray(rows) ? rows : [])
      .map((r) => map(r || {}))
      .filter((r) => r && clean(r[keyField]) !== undefined);
    if (list.length) out[key] = list;
  };

  pushIf("vaccinations", records.vaccinations, "name", (r) => ({
    name: clean(r.name),
    dateGiven: clean(r.dateGiven) || null,
    expiresOn: clean(r.expiresOn) || null,
    clinicName: clean(r.clinicName) || null,
    notes: clean(r.notes) || null,
  }));
  pushIf("medications", records.medications, "name", (r) => ({
    name: clean(r.name),
    dose: clean(r.dose) || null,
    frequency: clean(r.frequency) || null,
    prescribedBy: clean(r.prescribedBy) || null,
    startDate: clean(r.startDate) || null,
    notes: clean(r.notes) || null,
  }));
  pushIf("surgeries", records.surgeries, "procedure", (r) => ({
    procedure: clean(r.procedure),
    surgeryDate: clean(r.surgeryDate) || null,
    surgeon: clean(r.surgeon) || null,
    clinic: clean(r.clinic) || null,
    notes: clean(r.notes) || null,
  }));
  pushIf("labResults", records.labResults, "testName", (r) => ({
    testName: clean(r.testName),
    testDate: clean(r.testDate) || null,
    results: clean(r.results) || null,
    orderedBy: clean(r.orderedBy) || null,
    notes: clean(r.notes) || null,
  }));
  pushIf("allergies", records.allergies, "allergen", (r) => ({
    allergen: clean(r.allergen),
    severity: clean(r.severity) || null,
    reaction: clean(r.reaction) || null,
    diagnosedDate: clean(r.diagnosedDate) || null,
    notes: clean(r.notes) || null,
  }));
  pushIf("conditions", records.conditions, "condition", (r) => ({
    condition: clean(r.condition),
    status: clean(r.status) || null,
    diagnosedDate: clean(r.diagnosedDate) || null,
    notes: clean(r.notes) || null,
  }));
  pushIf("visitNotes", records.visitNotes, "note", (r) => ({
    vetName: clean(r.vetName) || null,
    noteDate: clean(r.noteDate) || null,
    note: clean(r.note),
  }));

  return out;
}

// --- the adapter -------------------------------------------------------------

/**
 * extractPetRecordsFromDocument({ url, filename, mimeType }, opts) → { docType, records }.
 *   Gating: no ANTHROPIC_API_KEY → throws EnrichmentNotConfiguredError (route → 503).
 *   Fail soft: unsupported type / unreadable file / model or parse error → { docType:'other', records:{} }.
 *   opts.fetchBytes / opts.callModel let tests inject mocks (no network in CI).
 * WRITES NOTHING — the return value is a proposal the owner reviews before any VR-B write.
 */
export async function extractPetRecordsFromDocument({ url, filename, mimeType } = {}, opts = {}) {
  const cfg = anthropicConfig();
  if (!cfg) throw new EnrichmentNotConfiguredError(); // dormant → 503

  const empty = { docType: "other", records: {} };
  const media = detectMedia({ filename, mimeType });
  if (!media) return empty;

  const fetchBytes = opts.fetchBytes || defaultFetchBytes;
  const callModel = opts.callModel || defaultCallModel;

  let buf;
  try {
    buf = await fetchBytes(url);
  } catch {
    return empty; // unreadable / oversized / gone → empty proposal, file still stored
  }

  const base64 = buf.toString("base64");
  const block =
    media.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: media.mediaType, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: media.mediaType, data: base64 } };

  let raw;
  try {
    raw = await callModel({ apiKey: cfg.apiKey, model: cfg.model, block });
  } catch {
    return empty; // model/parse/timeout error → empty proposal
  }

  const records = normalizeRecords(raw?.records);
  const docType = clean(raw?.docType) || "other";
  return { docType, records };
}

export { normalizeRecords };
