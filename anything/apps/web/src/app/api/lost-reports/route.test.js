import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/lost-reports — Lost & Found browse + activate (ticket 2.48). auth() + sql mocked.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));

const SESSION = { user: { id: 99 }, expires: "9999999999" };

function mockSql({ profile = [{ id: 7 }], pet = [{ id: 1, name: "Rex" }], reports = [], insert = [{ id: 30 }], followers = [] } = {}) {
  sql.mockImplementation((strings) => {
    const q = Array.isArray(strings) ? strings.join(" ") : "";
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve(profile);
    if (q.includes("FROM pets WHERE id")) return Promise.resolve(pet);
    if (q.includes("INSERT INTO lost_reports")) return Promise.resolve(insert);
    if (q.includes("FROM pet_follows")) return Promise.resolve(followers);
    if (q.includes("FROM lost_reports")) return Promise.resolve(reports);
    return Promise.resolve([]); // app_notify
  });
}

const postReq = (body) =>
  new Request("http://localhost/api/lost-reports", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET", () => {
  it("401 unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/lost-reports"))).status).toBe(401);
  });

  it("browses ACTIVE alerts with an optional bounding box", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ reports: [{ id: 5, pet_name: "Rex" }] });
    const res = await GET(new Request("http://localhost/api/lost-reports?lat=40.7&lng=-74&radiusKm=10"));
    expect(res.status).toBe(200);
    expect((await res.json()).reports[0].id).toBe(5);
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("r.status = 'active'");
    expect(text).toContain("BETWEEN");
  });

  it("mine=true lists the caller's reports", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ reports: [{ id: 6, status: "resolved" }] });
    const res = await GET(new Request("http://localhost/api/lost-reports?mine=true"));
    expect(res.status).toBe(200);
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("r.owner_user_id =");
  });
});

describe("POST activate", () => {
  it("owner activates lost mode and alerts followers (best-effort)", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ insert: [{ id: 30, status: "active" }], followers: [{ uid: 8 }] });
    const res = await POST(postReq({ petId: 1, lastSeenArea: "Park", lat: 40.7, lng: -74 }));
    expect(res.status).toBe(201);
    expect((await res.json()).report.id).toBe(30);
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("INSERT INTO lost_reports");
    expect(text).toContain("app_notify");
  });

  it("activation still succeeds if the follower alert throws", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockImplementation((strings) => {
      const q = Array.isArray(strings) ? strings.join(" ") : "";
      if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve([{ id: 7 }]);
      if (q.includes("FROM pets WHERE id")) return Promise.resolve([{ id: 1, name: "Rex" }]);
      if (q.includes("INSERT INTO lost_reports")) return Promise.resolve([{ id: 30 }]);
      if (q.includes("FROM pet_follows")) return Promise.reject(new Error("boom"));
      return Promise.resolve([]);
    });
    const res = await POST(postReq({ petId: 1 }));
    expect(res.status).toBe(201);
  });

  it("403 when the pet is not the caller's", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ pet: [] });
    expect((await POST(postReq({ petId: 2 }))).status).toBe(403);
  });

  it("400 without petId", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql();
    expect((await POST(postReq({}))).status).toBe(400);
  });
});
