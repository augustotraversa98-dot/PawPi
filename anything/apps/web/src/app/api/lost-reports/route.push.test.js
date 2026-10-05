import { describe, it, expect, vi, beforeEach } from "vitest";

// Lost-pet alerts reach the phone (notifications v2, PR 3c): AFTER the in-app bell row, the owner push pipeline
// (flag-gated, prefs / quiet hours / cap / tokens decided there) is asked once per follower, bounded.

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));
vi.mock("@/app/api/utils/ownerNotifications", () => ({ pushForOwnerNotification: vi.fn().mockResolvedValue({ pushed: true }) }));

import { POST } from "./route";
import { POST as SIGHTING } from "./[id]/sightings/route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { pushForOwnerNotification } from "@/app/api/utils/ownerNotifications";

const SESSION = { user: { id: 99 }, expires: "9999999999" };
const post = (body) => new Request("http://localhost/api/lost-reports", { method: "POST", body: JSON.stringify(body) });

function mockSql({ followers, notifyId = 500 }) {
  sql.mockImplementation((strings) => {
    const q = strings.join(" ");
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve([{ id: 7 }]);
    if (q.includes("FROM pets WHERE id")) return Promise.resolve([{ id: 1, name: "Rex" }]);
    if (q.includes("INSERT INTO lost_reports")) return Promise.resolve([{ id: 30 }]);
    if (q.includes("FROM pet_follows")) return Promise.resolve(followers);
    if (q.includes("app_notify")) return Promise.resolve([{ id: notifyId }]);
    if (q.includes("FROM lost_reports")) return Promise.resolve([{ owner_user_id: 8 }]);
    if (q.includes("INSERT INTO lost_sightings")) return Promise.resolve([{ id: 1 }]);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
});

describe("POST /api/lost-reports — follower alerts", () => {
  it("asks the push pipeline once per follower AFTER the bell row, with type lost_alert", async () => {
    mockSql({ followers: [{ uid: 11 }, { uid: 12 }] });
    const res = await POST(post({ petId: 1, lastSeenArea: "Park" }));
    expect(res.status).toBe(201);
    expect(pushForOwnerNotification.mock.calls.map((c) => c[0])).toEqual([
      { recipient: 11, type: "lost_alert", subjectRef: "1" },
      { recipient: 12, type: "lost_alert", subjectRef: "1" },
    ]);
  });

  it("no bell row created (app_notify returned null) → no push for that follower", async () => {
    mockSql({ followers: [{ uid: 11 }], notifyId: null });
    await POST(post({ petId: 1 }));
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });

  it("phone pushes are bounded (100) while every follower still gets the in-app alert", async () => {
    const followers = Array.from({ length: 130 }, (_, i) => ({ uid: 1000 + i }));
    mockSql({ followers });
    await POST(post({ petId: 1 }));
    expect(pushForOwnerNotification).toHaveBeenCalledTimes(100);
    const notifies = sql.mock.calls.filter((c) => c[0].join(" ").includes("app_notify"));
    expect(notifies).toHaveLength(130);
  });

  it("activation still succeeds when the push layer fails", async () => {
    mockSql({ followers: [{ uid: 11 }] });
    pushForOwnerNotification.mockRejectedValueOnce(new Error("boom"));
    expect((await POST(post({ petId: 1 }))).status).toBe(201);
  });
});

describe("POST /api/lost-reports/[id]/sightings — owner alert", () => {
  const sight = () =>
    new Request("http://localhost/api/lost-reports/30/sightings", { method: "POST", body: JSON.stringify({ lat: 1, lng: 2, note: "seen" }) });

  it("pushes to the report owner after the bell row", async () => {
    mockSql({ followers: [] });
    const res = await SIGHTING(sight(), { params: { id: "30" } });
    expect(res.status).toBe(201);
    expect(pushForOwnerNotification).toHaveBeenCalledWith({ recipient: 8, type: "lost_alert", subjectRef: "30" });
  });
});
