import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/providers/[id]/enrich (ticket 2.21) — confirm-first enrichment. Proves: returns a
// PROPOSED draft from mocked website + Places; missing keys → clean 503; a failing source is
// isolated (not a 500); and the route NEVER writes provider data (only the read SELECT runs).
// auth + sql + providerAuth mocked; resolveUserId real (sql call 1 = profile). global.fetch
// mocked for the enrichment sources.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderRole } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error {
    constructor(m) {
      super(m);
      this.name = "ProviderAuthError";
      this.status = 403;
    }
  }
  return { requireProviderRole: vi.fn(), ProviderAuthError };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100" } };
const req = () => new Request("http://localhost/x", { method: "POST" });
const PROVIDER = {
  id: 100,
  name: "Happy Paws",
  website_url: "https://hp.example",
  instagram_url: "https://ig.example/hp",
  facebook_url: null,
  google_maps_url: "https://maps.example/?q=Happy+Paws",
};

let savedPlaces, savedLlm, savedFetch;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  requireProviderRole.mockResolvedValue({ role: "owner" });
  sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId
  savedPlaces = process.env.GOOGLE_PLACES_API_KEY;
  savedLlm = process.env.ENRICHMENT_LLM_KEY;
  savedFetch = global.fetch;
});
afterEach(() => {
  if (savedPlaces === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = savedPlaces;
  if (savedLlm === undefined) delete process.env.ENRICHMENT_LLM_KEY;
  else process.env.ENRICHMENT_LLM_KEY = savedLlm;
  global.fetch = savedFetch;
});

describe("POST enrich", () => {
  it("no enrichment keys → clean 503, never reads the provider", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.ENRICHMENT_LLM_KEY;
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(503);
    // Only the profile lookup ran (resolveUserId); no provider SELECT.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("returns a PROPOSED draft from website + Places, and writes NOTHING", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "pk";
    sql.mockResolvedValueOnce([PROVIDER]); // provider links SELECT

    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.startsWith("https://hp.example")) {
        return {
          ok: true,
          text: async () =>
            '<meta name="description" content="Caring vets since 2010"><body>Vaccines and checkups</body>',
        };
      }
      if (u.includes("findplacefromtext")) {
        return { json: async () => ({ candidates: [{ place_id: "PID" }] }) };
      }
      if (u.includes("details/json")) {
        return {
          json: async () => ({
            result: {
              formatted_address: "1 Main St",
              formatted_phone_number: "555-1000",
              opening_hours: { weekday_text: ["Mon 9-5"] },
              geometry: { location: { lat: 1, lng: 2 } },
              photos: [{ photo_reference: "PH1" }],
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.applied).toBe(false);
    expect(body.draft.description).toContain("Caring vets since 2010");
    expect(body.draft.address).toBe("1 Main St");
    expect(body.draft.phone).toBe("555-1000");
    expect(body.draft.hours).toEqual(["Mon 9-5"]);
    expect(body.draft.photos).toEqual(["PH1"]);
    // IG/FB carried through (links-only, never scraped).
    expect(body.draft.instagram_url).toBe("https://ig.example/hp");
    expect(body.sources).toEqual({ website: "ok", google_place: "ok" });

    // CONFIRM-FIRST: the enrich path issued NO write — only resolveUserId + the read SELECT.
    const wrote = sql.mock.calls.some((c) =>
      /INSERT|UPDATE/i.test((c?.[0] ?? []).join(" ")),
    );
    expect(wrote).toBe(false);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("isolates a failing source (website fetch throws) without failing the call", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "pk";
    sql.mockResolvedValueOnce([PROVIDER]);
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.startsWith("https://hp.example")) throw new Error("network down");
      if (u.includes("findplacefromtext"))
        return { json: async () => ({ candidates: [{ place_id: "PID" }] }) };
      if (u.includes("details/json"))
        return { json: async () => ({ result: { formatted_address: "1 Main St" } }) };
      return { ok: false, json: async () => ({}) };
    });

    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Website failed (isolated) but Places still produced data.
    expect(body.sources.website).toBe("failed");
    expect(body.sources.google_place).toBe("ok");
    expect(body.draft.address).toBe("1 Main St");
  });

  it("non-owner/admin → 403", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "pk";
    const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
    requireProviderRole.mockRejectedValue(new ProviderAuthError("Not authorized"));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(403);
  });
});
