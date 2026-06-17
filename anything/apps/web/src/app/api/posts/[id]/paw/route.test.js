import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/posts/[id]/paw — paw a post + notify the post owner (ticket 2.26).
// Session + DB mocked at the module boundary; each await sql`...` consumes one
// mockResolvedValueOnce in order.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7 };
const pawReq = () =>
  new Request("http://localhost/api/posts/5/paw", { method: "POST" });
const notifyCall = () =>
  sql.mock.calls.find((c) => (c?.[0] ?? []).join(" ").includes("app_notify"));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/posts/[id]/paw", () => {
  it("401 when anonymous, never touches the DB", async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(pawReq(), { params: { id: "5" } });
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("404 when the post does not exist", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]); // post missing
    const res = await POST(pawReq(), { params: { id: "5" } });
    expect(res.status).toBe(404);
  });

  it("already pawed → 200 and does NOT notify", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5, user_id: 9 }]) // post owned by 9
      .mockResolvedValueOnce([{ id: 1 }]); // existing paw → early return
    const res = await POST(pawReq(), { params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(notifyCall()).toBeFalsy();
  });

  it("new paw → notifies the post owner (not the actor)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile (7)
      .mockResolvedValueOnce([{ id: 5, user_id: 9 }]) // post owned by 9
      .mockResolvedValueOnce([]) // no existing paw
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce([{ count: 1 }]) // paw count
      .mockResolvedValueOnce([{ app_notify: 1 }]); // notify
    const res = await POST(pawReq(), { params: { id: "5" } });
    expect(res.status).toBe(200);
    const call = notifyCall();
    expect(call).toBeTruthy();
    const values = call.slice(1);
    expect(values).toContain(9); // recipient = post owner
    expect(values).toContain(7); // actor = caller
    expect(values).toContain("paw");
  });

  it("self-paw (owner is the actor) → no notification", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile (7)
      .mockResolvedValueOnce([{ id: 5, user_id: 7 }]) // post owned by the actor
      .mockResolvedValueOnce([]) // no existing paw
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce([{ count: 1 }]); // paw count (no notify call follows)
    const res = await POST(pawReq(), { params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(notifyCall()).toBeFalsy();
  });
});
