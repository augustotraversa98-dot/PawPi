import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/events/[id] — one event (ticket 2.74). GET detail + attendee_count + my_rsvp; PATCH host-only
// edit/cancel; DELETE host-only soft-delete. RLS scopes the writes — a non-host touches ZERO → 404.

import { GET, PATCH, DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "8" } };
const get = () => new Request("http://localhost/api/events/8");
const patch = (body) =>
  new Request("http://localhost/api/events/8", { method: "PATCH", body: JSON.stringify(body) });
const del = () => new Request("http://localhost/api/events/8", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/events/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(get(), PARAMS)).status).toBe(401);
  });

  it("not found / not visible → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await GET(get(), PARAMS)).status).toBe(404);
  });

  it("found → 200 with attendee_count + my_rsvp", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 8, attendee_count: 3, my_rsvp: "going" }]);
    const res = await GET(get(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).event).toMatchObject({ id: 8, my_rsvp: "going" });
  });
});

describe("PATCH /api/events/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await PATCH(patch({ title: "x" }), PARAMS)).status).toBe(401);
  });

  it("invalid status → 400", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await PATCH(patch({ status: "deleted" }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("empty title → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await PATCH(patch({ title: "   " }), PARAMS)).status).toBe(400);
  });

  it("host edit → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 8, title: "New" }]);
    const res = await PATCH(patch({ title: "New" }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).event).toMatchObject({ title: "New" });
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("UPDATE events");
    expect(q).toContain("host_user_id =");
  });

  it("non-host → ZERO rows → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await PATCH(patch({ title: "New" }), PARAMS)).status).toBe(404);
  });

  it("cancel (status) is allowed → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 8, status: "cancelled" }]);
    expect((await PATCH(patch({ status: "cancelled" }), PARAMS)).status).toBe(200);
  });
});

describe("DELETE /api/events/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await DELETE(del(), PARAMS)).status).toBe(401);
  });

  it("host soft-delete → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 8 }]);
    const res = await DELETE(del(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(sql.mock.calls[0][0].join(" ")).toContain("deleted_at = now()");
  });

  it("non-host / already deleted → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await DELETE(del(), PARAMS)).status).toBe(404);
  });
});
