import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/events — community events (ticket 2.74). Published public read; host-scoped create.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify(body) });
const good = { title: "Puppy Social", starts_at: "2026-08-01T17:00:00Z", lat: 40.7, lng: -74 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/events", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(new Request("http://localhost/api/events"))).status).toBe(401);
  });

  it("lists published upcoming events → 200", async () => {
    auth.mockResolvedValue(SESSION);
    // GET composes a conditional sql`` fragment, so the tag is called more than once; a persistent
    // mock returns the events from the main (outer) call.
    sql.mockResolvedValue([{ id: 1, title: "Puppy Social", attendee_count: 3 }]);
    const res = await GET(new Request("http://localhost/api/events?lat=40.7&lng=-74"));
    expect(res.status).toBe(200);
    expect((await res.json()).events).toHaveLength(1);
    const fired = sql.mock.calls.map((c) => c[0].join(" "));
    expect(fired.some((q) => q.includes("FROM events"))).toBe(true);
    expect(fired.some((q) => q.includes("attendee_count"))).toBe(true);
  });
});

describe("POST /api/events", () => {
  it("missing title → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ starts_at: "2026-08-01" }))).status).toBe(400);
  });

  it("missing start time → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ title: "x" }))).status).toBe(400);
  });

  it("invalid coordinates → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ ...good, lat: 999 }))).status).toBe(400);
  });

  it("valid event → 201 (host = caller)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, title: "Puppy Social", host_user_id: 7 }]);
    const res = await POST(post(good));
    expect(res.status).toBe(201);
    expect((await res.json()).event).toMatchObject({ host_user_id: 7 });
    expect(sql.mock.calls[0][0].join(" ")).toContain("INSERT INTO events");
  });
});
