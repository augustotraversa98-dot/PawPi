import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/training/self-progress — owner-scoped DIY training completion (ticket 2.45).

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
}));

const SESSION = { user: { id: 99 }, expires: "9999999999" };

function mockSql({ profile = [{ id: 7 }], pet = [{ id: 1 }], completed = [] } = {}) {
  sql.mockImplementation((strings) => {
    const q = Array.isArray(strings) ? strings.join(" ") : "";
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve(profile);
    if (q.includes("FROM pets WHERE id")) return Promise.resolve(pet);
    if (q.includes("FROM training_progress_self")) return Promise.resolve(completed);
    return Promise.resolve([]); // INSERT/DELETE
  });
}

const postReq = (body) =>
  new Request("http://localhost/api/training/self-progress", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET", () => {
  it("401 unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/training/self-progress?petId=1"));
    expect(res.status).toBe(401);
  });

  it("400 without petId", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql();
    const res = await GET(new Request("http://localhost/api/training/self-progress"));
    expect(res.status).toBe(400);
  });

  it("returns completed rows for the pet, owner-scoped", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ completed: [{ program_key: "basic-obedience", session_key: "sit" }] });
    const res = await GET(new Request("http://localhost/api/training/self-progress?petId=1"));
    expect(res.status).toBe(200);
    expect((await res.json()).completed[0].session_key).toBe("sit");
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("owner_user_id =");
    expect(text).toContain("pet_id =");
  });
});

describe("POST", () => {
  it("marks a session complete (idempotent upsert)", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql();
    const res = await POST(
      postReq({ petId: 1, programKey: "basic-obedience", sessionKey: "sit" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sessionKey: "sit", completed: true });
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("INSERT INTO training_progress_self");
    expect(text).toContain("ON CONFLICT");
  });

  it("un-completing deletes the row", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql();
    const res = await POST(
      postReq({ petId: 1, programKey: "basic-obedience", sessionKey: "sit", completed: false }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).completed).toBe(false);
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("DELETE FROM training_progress_self");
  });

  it("403 when the pet is not the caller's", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ pet: [] });
    const res = await POST(
      postReq({ petId: 2, programKey: "basic-obedience", sessionKey: "sit" }),
    );
    expect(res.status).toBe(403);
  });

  it("400 on missing keys", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql();
    const res = await POST(postReq({ petId: 1 }));
    expect(res.status).toBe(400);
  });
});
