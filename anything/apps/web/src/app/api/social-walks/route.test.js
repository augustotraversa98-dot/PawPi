import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/social-walks — schedule walks with buddies (ticket 2.43).
// POST: create a walk with map coords + (private) owner-issued invites.
// GET:  public ('nearby_pets') discovery with optional bounding box, the invitee view,
//        and myWalks. auth() + sql mocked; we assert on the generated SQL text + payloads.

import { POST, GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 99 }, expires: "9999999999" };
const OWNER = [{ id: 7 }]; // user_profiles.id for the session

const postReq = (body) =>
  new Request("http://localhost/api/social-walks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const getReq = (qs = "") =>
  new Request(`http://localhost/api/social-walks${qs}`);
const allText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/social-walks", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ petId: 1 }));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("creates a public walk with lat/lng/location_name", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce(OWNER) // profile lookup
      .mockResolvedValueOnce([{ id: 1 }]) // pet ownership
      .mockResolvedValueOnce([{ id: 50, visibility: "nearby_pets", lat: 40.7, lng: -74 }]); // INSERT

    const res = await POST(
      postReq({
        petId: 1,
        walkName: "Park loop",
        scheduledAt: "2026-09-01T09:00:00Z",
        visibility: "nearby_pets",
        lat: 40.7,
        lng: -74.0,
        locationName: "Central Park",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.socialWalk.id).toBe(50);
    const text = allText();
    expect(text).toContain("INSERT INTO social_walks");
    expect(text).toContain("location_name");
    // no invites inserted for a public walk
    expect(text).not.toContain("INSERT INTO social_walk_invites");
  });

  it("rejects an out-of-range lat/lng", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(OWNER);
    const res = await POST(
      postReq({
        petId: 1,
        walkName: "bad",
        scheduledAt: "2026-09-01T09:00:00Z",
        visibility: "nearby_pets",
        lat: 999,
        lng: 0,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("a private walk inserts owner-issued invites (deduped, owner excluded)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce(OWNER) // profile lookup
      .mockResolvedValueOnce([{ id: 1 }]) // pet ownership
      .mockResolvedValueOnce([{ id: 51, visibility: "private" }]) // INSERT walk
      .mockResolvedValueOnce([]) // invite 8
      .mockResolvedValueOnce([]); // invite 9

    const res = await POST(
      postReq({
        petId: 1,
        walkName: "Private meetup",
        scheduledAt: "2026-09-01T09:00:00Z",
        visibility: "private",
        inviteUserIds: [8, 9, 9, 7], // dup 9 + owner 7 are dropped
      }),
    );

    expect(res.status).toBe(201);
    const text = allText();
    expect(text).toContain("INSERT INTO social_walk_invites");
    // exactly two invite inserts (8 and 9) — owner (7) and the dup are filtered out
    const inviteCalls = sql.mock.calls.filter((c) =>
      (c?.[0] ?? []).join(" ").includes("INSERT INTO social_walk_invites"),
    );
    expect(inviteCalls).toHaveLength(2);
  });
});

describe("GET /api/social-walks", () => {
  it("public discovery applies a bounding box when lat/lng given", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce(OWNER) // profile lookup
      .mockResolvedValueOnce([{ id: 50 }]); // walks

    const res = await GET(
      getReq("?visibility=nearby_pets&lat=40.7&lng=-74&radiusKm=10"),
    );
    expect(res.status).toBe(200);
    const text = allText();
    expect(text).toContain("sw.visibility = 'nearby_pets'");
    expect(text).toContain("BETWEEN");
    // The non-owner filter keeps your own walks out of discovery.
    expect(text).toContain("sw.owner_user_id !=");
  });

  it("invited mode returns private walks the user was invited to", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce(OWNER) // profile lookup
      .mockResolvedValueOnce([{ id: 51, visibility: "private" }]); // invited walks

    const res = await GET(getReq("?invited=true"));
    expect(res.status).toBe(200);
    const text = allText();
    expect(text).toContain("social_walk_invites");
    expect(text).toContain("swi.invited_user_id =");
  });
});
