import { describe, it, expect, vi, beforeEach } from "vitest";

// GET/POST /api/providers/[id]/calendar-feeds (ticket 2.84). Proves: list returns the provider's
// feeds; add validates the URL (400 on a non-http value) then inserts; auth/role gates.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderRole } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => ({
  requireProviderRole: vi.fn(),
  ALL_PROVIDER_ROLES: ["owner", "admin", "staff", "vet"],
}));

const SESSION = { user: { id: 42 }, expires: "9999" };
const PARAMS = { params: { id: "100" } };
const post = (body) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  requireProviderRole.mockResolvedValue({ role: "owner" });
  sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId
});

describe("calendar-feeds", () => {
  it("GET lists the provider's feeds", async () => {
    sql.mockResolvedValueOnce([
      { id: 1, ics_url: "https://x/f.ics", last_synced_at: null, active: true },
    ]);
    const res = await GET(new Request("http://localhost/x"), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).feeds).toHaveLength(1);
  });

  it("POST rejects a non-http url with 400", async () => {
    const res = await POST(post({ ics_url: "webcal://x" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("POST inserts a valid feed", async () => {
    sql.mockResolvedValueOnce([
      { id: 9, ics_url: "https://x/f.ics", active: true },
    ]);
    const res = await POST(post({ ics_url: "https://x/f.ics" }), PARAMS);
    expect(res.status).toBe(201);
    expect((await res.json()).feed.id).toBe(9);
  });

  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/x"), PARAMS);
    expect(res.status).toBe(401);
  });
});
