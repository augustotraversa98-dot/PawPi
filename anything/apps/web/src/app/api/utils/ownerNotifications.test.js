import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withSavepoint: (fn) => fn() }));
vi.mock("@/app/api/utils/push", () => ({ sendPush: vi.fn() }));

import sql from "@/app/api/utils/sql";
import { sendPush } from "@/app/api/utils/push";
import { __resetNotifV2SchemaStateForTests } from "@/app/api/utils/notifV2";
import {
  OWNER_PUSH_TYPES,
  decideOwnerPush,
  ownerPushTypeInfo,
  renderOwnerPushContent,
  pushForOwnerNotification,
} from "./ownerNotifications";

const text = (c) => c[0].join("?");
// Noon in Buenos Aires (UTC-3): outside the default 22:00-08:00 quiet window.
const NOON = new Date("2026-10-05T15:00:00Z");
const NIGHT = new Date("2026-10-06T01:30:00Z"); // 22:30 in Buenos Aires: inside it

function routeSql({ pref, locale = "en", settings = undefined }) {
  sql.mockImplementation(async (strings) => {
    const q = strings.join("?");
    if (q.includes("app_recipient_notification_settings")) {
      if (settings instanceof Error) throw settings;
      return [settings ?? { quiet_hours_enabled: true, quiet_start: 22, quiet_end: 8, timezone: null }];
    }
    if (q.includes("app_notification_pref_enabled")) {
      if (pref instanceof Error) throw pref;
      return [{ enabled: pref }];
    }
    if (q.includes("app_recipient_locale")) return [{ locale }];
    throw new Error(`unexpected sql: ${q}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  __resetNotifV2SchemaStateForTests();
  delete process.env.NOTIF_V2_ENABLED;
  sendPush.mockResolvedValue({ sent: 1 });
});
afterEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
});

describe("decideOwnerPush", () => {
  it("promotional needs an EXPLICIT opt-in (absent = off)", () => {
    expect(decideOwnerPush({ promotional: true }, undefined)).toBe(false);
    expect(decideOwnerPush({ promotional: true }, false)).toBe(false);
    expect(decideOwnerPush({ promotional: true }, true)).toBe(true);
  });
  it("transactional rings unless explicitly off", () => {
    expect(decideOwnerPush({ promotional: false }, undefined)).toBe(true);
    expect(decideOwnerPush({ promotional: false }, true)).toBe(true);
    expect(decideOwnerPush({ promotional: false }, false)).toBe(false);
  });
});

describe("types + copy", () => {
  it("transactional owner events map to default-ON categories", () => {
    const expected = {
      booking_confirmed: "owner_bookings",
      booking_declined: "owner_bookings",
      booking_cancelled: "owner_bookings",
      adoption_approved: "owner_adoption",
      adoption_declined: "owner_adoption",
      walk_request_accepted: "owner_walk_requests",
      lost_alert: "owner_lost_alerts",
    };
    for (const [type, category] of Object.entries(expected)) {
      expect(ownerPushTypeInfo(type), type).toEqual({ category, promotional: false });
    }
    // chatty / social types and "under review" never ring the phone
    for (const type of ["paw", "bark", "follow", "adoption_under_review", "booking_requested", "welcome", "pack_invite", "boop"]) {
      expect(ownerPushTypeInfo(type), type).toBeNull();
    }
  });
  it("digest and win-back are promotional owner push types", () => {
    expect(ownerPushTypeInfo("weekly_digest")).toEqual({ category: "weekly_digest_push", promotional: true });
    expect(ownerPushTypeInfo("winback")).toEqual({ category: "winback_push", promotional: true });
    expect(ownerPushTypeInfo("paw")).toBeNull();
    expect(ownerPushTypeInfo("__proto__")).toBeNull();
  });
  it("renders EN / ES (voseo) copy with the pet name and a generic fallback", () => {
    expect(renderOwnerPushContent("weekly_digest", "en", { petName: "Rex" }).title).toBe("Rex's week 🐾");
    expect(renderOwnerPushContent("weekly_digest", "es", { petName: "Rex" }).title).toBe("La semana de Rex 🐾");
    expect(renderOwnerPushContent("winback", "es", { petName: "Rex" }).body).toContain("esperándote");
    expect(renderOwnerPushContent("winback", "en", {}).title).toBe("Your pup says hi 🐾");
    expect(renderOwnerPushContent("nope", "es").body).toContain("Tenés");
  });
  it("every owner push type has EN + ES copy (no generic fallback)", () => {
    for (const type of Object.keys(OWNER_PUSH_TYPES)) {
      for (const loc of ["en", "es"]) {
        const { title, body } = renderOwnerPushContent(type, loc, { petName: "Rex" });
        expect(title, `${type}/${loc}`).not.toBe("PawPi");
        expect(body.length).toBeGreaterThan(10);
      }
    }
  });
  it("copy is warm: no guilt words, no diagnostic/health wording", () => {
    const banned = /(haven't|forgot|overdue|missed|olvidaste|no abriste|descuidaste|sick|\bill\b|diagn|enferm|symptom|síntoma|disease|enfermedad)/i;
    for (const type of Object.keys(OWNER_PUSH_TYPES)) {
      for (const loc of ["en", "es"]) {
        const { title, body } = renderOwnerPushContent(type, loc, { petName: "Rex" });
        expect(`${title} ${body}`).not.toMatch(banned);
      }
    }
  });
});

describe("pushForOwnerNotification", () => {
  it("flag OFF: does nothing, issues no query, never calls the push layer", async () => {
    routeSql({ pref: true });
    expect(await pushForOwnerNotification({ recipient: 7, type: "weekly_digest" })).toEqual({ pushed: false, skipped: "disabled" });
    expect(sql).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  describe("flag ON", () => {
    beforeEach(() => {
      process.env.NOTIF_V2_ENABLED = "true";
    });

    it("no stored pref (default OFF) → NO push", async () => {
      routeSql({ pref: null });
      expect(await pushForOwnerNotification({ recipient: 7, type: "winback", petName: "Rex" })).toMatchObject({ pushed: false, skipped: "pref" });
      expect(sendPush).not.toHaveBeenCalled();
    });

    it("explicit opt-out → NO push", async () => {
      routeSql({ pref: false });
      expect((await pushForOwnerNotification({ recipient: 7, type: "weekly_digest" })).pushed).toBe(false);
      expect(sendPush).not.toHaveBeenCalled();
    });

    it("opted in → pushes in the recipient's language with the right category/type metadata", async () => {
      routeSql({ pref: true, locale: "en" });
      const res = await pushForOwnerNotification({ recipient: 7, type: "weekly_digest", subjectRef: "5", petName: "Rex", now: NOON });
      expect(res.pushed).toBe(true);
      expect(sendPush).toHaveBeenCalledTimes(1);
      const [recipient, content, opts] = sendPush.mock.calls[0];
      expect(recipient).toBe(7);
      expect(content.title).toBe("Rex's week 🐾");
      expect(content.data).toEqual({ type: "weekly_digest", subjectRef: "5" });
      expect(opts).toEqual({ type: "weekly_digest", category: "weekly_digest_push", subjectRef: "5", cap: 3 });
      const prefQuery = sql.mock.calls.find((c) => text(c).includes("app_notification_pref_enabled"));
      expect(prefQuery.slice(1)).toEqual([7, "weekly_digest_push"]);
    });

    it("es-AR voseo when the stored locale is es / null", async () => {
      routeSql({ pref: true, locale: "es" });
      await pushForOwnerNotification({ recipient: 7, type: "winback", petName: "Luna", now: NOON });
      expect(sendPush.mock.calls[0][1].title).toBe("Luna te manda un saludo 🐾");
    });

    it("a preference lookup failure is treated as NOT opted in (promotional fails closed)", async () => {
      routeSql({ pref: Object.assign(new Error("db"), { code: "XX000" }) });
      expect((await pushForOwnerNotification({ recipient: 7, type: "winback", now: NOON })).pushed).toBe(false);
      expect(sendPush).not.toHaveBeenCalled();
    });

    it("unknown type / missing recipient → no push; never throws", async () => {
      routeSql({ pref: true });
      expect((await pushForOwnerNotification({ recipient: 7, type: "paw" })).pushed).toBe(false);
      expect((await pushForOwnerNotification({ recipient: null, type: "winback" })).pushed).toBe(false);
      sendPush.mockRejectedValue(new Error("boom"));
      expect((await pushForOwnerNotification({ recipient: 7, type: "winback", now: NOON })).pushed).toBe(false);
    });
  });
});

describe("pushForOwnerNotification — transactional events, quiet hours and cap (PR 3c)", () => {
  beforeEach(() => {
    process.env.NOTIF_V2_ENABLED = "true";
  });
  const push = (extra = {}) =>
    pushForOwnerNotification({ recipient: 7, type: "booking_confirmed", subjectRef: "55", now: NOON, ...extra });

  it("no stored pref → transactional rings (default ON), in the recipient's language", async () => {
    routeSql({ pref: null, locale: "es" });
    expect((await push()).pushed).toBe(true);
    const [recipient, content, opts] = sendPush.mock.calls[0];
    expect(recipient).toBe(7);
    expect(content.title).toBe("Reserva confirmada ✅");
    expect(opts).toEqual({ type: "booking_confirmed", category: "owner_bookings", subjectRef: "55", cap: 3 });
  });

  it("the owner turned that CATEGORY off → no push (other categories unaffected)", async () => {
    routeSql({ pref: false });
    expect(await push()).toMatchObject({ pushed: false, skipped: "pref" });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("QUIET HOURS (default 22:00-08:00 owner-local) → no push, and the tokens/cap are never touched", async () => {
    routeSql({ pref: true });
    expect(await push({ now: NIGHT })).toMatchObject({ pushed: false, skipped: "quiet-hours" });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("quiet hours use the OWNER's zone, not the server's", async () => {
    // 01:30 UTC = 10:30 in Tokyo (awake) but 22:30 in Buenos Aires (asleep)
    routeSql({ pref: true, settings: { quiet_hours_enabled: true, quiet_start: 22, quiet_end: 8, timezone: "Asia/Tokyo" } });
    expect((await push({ now: NIGHT })).pushed).toBe(true);
    sendPush.mockClear();
    routeSql({ pref: true, settings: { quiet_hours_enabled: true, quiet_start: 22, quiet_end: 8, timezone: "America/Buenos_Aires" } });
    expect((await push({ now: NIGHT })).skipped).toBe("quiet-hours");
  });

  it("the owner disabled quiet hours → rings at night; a custom window is honoured", async () => {
    routeSql({ pref: true, settings: { quiet_hours_enabled: false, quiet_start: 22, quiet_end: 8, timezone: null } });
    expect((await push({ now: NIGHT })).pushed).toBe(true);
    sendPush.mockClear();
    // noon is quiet for a 12-14 window
    routeSql({ pref: true, settings: { quiet_hours_enabled: true, quiet_start: 12, quiet_end: 14, timezone: null } });
    expect((await push({ now: NOON })).skipped).toBe("quiet-hours");
  });

  it("settings unreadable (table not applied) → the DEFAULT window still protects the owner at night", async () => {
    routeSql({ pref: true, settings: Object.assign(new Error("missing"), { code: "42883" }) });
    expect((await push({ now: NIGHT })).skipped).toBe("quiet-hours");
    expect((await push({ now: NOON })).pushed).toBe(true);
  });

  it("OVER CAP → the push layer reports it and nothing is sent", async () => {
    routeSql({ pref: true });
    sendPush.mockResolvedValue({ sent: 0, skipped: "cap" });
    const res = await push();
    expect(res).toMatchObject({ pushed: false, skipped: "cap" });
  });

  it("NOTIF_V2_DAILY_CAP overrides the default cap", async () => {
    process.env.NOTIF_V2_DAILY_CAP = "5";
    routeSql({ pref: true });
    await push();
    expect(sendPush.mock.calls[0][2].cap).toBe(5);
    delete process.env.NOTIF_V2_DAILY_CAP;
  });

  it("an invalid/absent token is handled in the push layer (no tokens → nothing sent)", async () => {
    routeSql({ pref: true });
    sendPush.mockResolvedValue({ sent: 0, skipped: "no-tokens" });
    expect(await push()).toMatchObject({ pushed: false, skipped: "no-tokens" });
  });
});
