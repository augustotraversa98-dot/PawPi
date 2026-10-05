import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withSavepoint: (fn) => fn() }));
vi.mock("@/app/api/utils/push", () => ({ sendPush: vi.fn() }));

import sql from "@/app/api/utils/sql";
import { sendPush } from "@/app/api/utils/push";
import { __resetNotifV2SchemaStateForTests } from "@/app/api/utils/notifV2";
import {
  decideOwnerPush,
  ownerPushTypeInfo,
  renderOwnerPushContent,
  pushForOwnerNotification,
} from "./ownerNotifications";

const text = (c) => c[0].join("?");
function routeSql({ pref, locale = "en" }) {
  sql.mockImplementation(async (strings) => {
    const q = strings.join("?");
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
  it("copy is warm: no guilt words, no health claims", () => {
    const banned = /(haven't|forgot|overdue|missed|olvidaste|no abriste|descuidaste|sick|ill|diagn|enferm)/i;
    for (const type of ["weekly_digest", "winback"]) {
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
      const res = await pushForOwnerNotification({ recipient: 7, type: "weekly_digest", subjectRef: "5", petName: "Rex" });
      expect(res.pushed).toBe(true);
      expect(sendPush).toHaveBeenCalledTimes(1);
      const [recipient, content, opts] = sendPush.mock.calls[0];
      expect(recipient).toBe(7);
      expect(content.title).toBe("Rex's week 🐾");
      expect(content.data).toEqual({ type: "weekly_digest", subjectRef: "5" });
      expect(opts).toEqual({ type: "weekly_digest", category: "weekly_digest_push", subjectRef: "5", cap: null });
      const prefQuery = sql.mock.calls.find((c) => text(c).includes("app_notification_pref_enabled"));
      expect(prefQuery.slice(1)).toEqual([7, "weekly_digest_push"]);
    });

    it("es-AR voseo when the stored locale is es / null", async () => {
      routeSql({ pref: true, locale: "es" });
      await pushForOwnerNotification({ recipient: 7, type: "winback", petName: "Luna" });
      expect(sendPush.mock.calls[0][1].title).toBe("Luna te manda un saludo 🐾");
    });

    it("a preference lookup failure is treated as NOT opted in (promotional fails closed)", async () => {
      routeSql({ pref: Object.assign(new Error("db"), { code: "XX000" }) });
      expect((await pushForOwnerNotification({ recipient: 7, type: "winback" })).pushed).toBe(false);
      expect(sendPush).not.toHaveBeenCalled();
    });

    it("unknown type / missing recipient → no push; never throws", async () => {
      routeSql({ pref: true });
      expect((await pushForOwnerNotification({ recipient: 7, type: "paw" })).pushed).toBe(false);
      expect((await pushForOwnerNotification({ recipient: null, type: "winback" })).pushed).toBe(false);
      sendPush.mockRejectedValue(new Error("boom"));
      expect((await pushForOwnerNotification({ recipient: 7, type: "winback" })).pushed).toBe(false);
    });
  });
});
