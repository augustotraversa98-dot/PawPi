import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/lost-reports/[id]/sightings — report a sighting (ticket 2.48). auth() + sql mocked.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));

const SESSION = { user: { id: 99 }, expires: "9999999999" };

function mockSql({ profile = [{ id: 7 }], insert = [{ id: 40 }], owner = [{ owner_user_id: 5 }] } = {}) {
  sql.mockImplementation((strings) => {
    const q = Array.isArray(strings) ? strings.join(" ") : "";
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve(profile);
    if (q.includes("INSERT INTO lost_sightings")) return Promise.resolve(insert);
    if (q.includes("owner_user_id FROM lost_reports")) return Promise.resolve(owner);
    return Promise.resolve([]); // app_notify
  });
}

const req = (body) =>
  new Request("http://localhost/api/lost-reports/1/sightings", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("401 unauthenticated", async () => {
  auth.mockResolvedValue(null);
  expect((await POST(req({ note: "saw it" }), { params: { id: "1" } })).status).toBe(401);
});

it("any authed user can report a sighting (reporter pinned to caller) + notifies owner", async () => {
  auth.mockResolvedValue(SESSION);
  mockSql();
  const res = await POST(req({ note: "near the park", lat: 40.7, lng: -74 }), { params: { id: "1" } });
  expect(res.status).toBe(201);
  expect((await res.json()).sighting.id).toBe(40);
  const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
  expect(text).toContain("INSERT INTO lost_sightings");
  expect(text).toContain("app_notify");
});

it("400 when the sighting has no note, location, or photo", async () => {
  auth.mockResolvedValue(SESSION);
  mockSql();
  expect((await POST(req({}), { params: { id: "1" } })).status).toBe(400);
});

it("404 when RLS rejects the insert (report not active)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockImplementation((strings) => {
    const q = Array.isArray(strings) ? strings.join(" ") : "";
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve([{ id: 7 }]);
    if (q.includes("INSERT INTO lost_sightings")) return Promise.reject(new Error("new row violates row-level security policy"));
    return Promise.resolve([]);
  });
  const res = await POST(req({ note: "late" }), { params: { id: "1" } });
  expect(res.status).toBe(404);
});
