import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A family member's / caregiver's own settings decide whether the finder push rings their phone.

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withSavepoint: (fn) => fn() }));
vi.mock("@/app/api/utils/push", () => ({ sendPush: vi.fn() }));

import sql from "@/app/api/utils/sql";
import { ownerSettingsAllowPush } from "./ownerNotifications";
import { __resetNotifV2SchemaStateForTests } from "./notifV2";

const NIGHT = new Date("2026-11-26T06:00:00Z"); // 03:00 in Buenos Aires
const DAY = new Date("2026-11-26T15:00:00Z"); // 12:00 in Buenos Aires

function answer({ pref = null, quiet = null } = {}) {
  sql.mockImplementation(async (strings) => {
    const q = strings.join("?");
    if (q.includes("app_notification_pref_enabled")) return [{ enabled: pref }];
    if (q.includes("app_recipient_notification_settings")) return quiet ? [quiet] : [];
    throw new Error(`unexpected sql: ${q}`);
  });
}
const allow = (now = DAY) => ownerSettingsAllowPush(8, "owner_lost_alerts", now);

beforeEach(() => {
  vi.clearAllMocks();
  __resetNotifV2SchemaStateForTests();
  delete process.env.NOTIF_V2_ENABLED;
});
afterEach(() => delete process.env.NOTIF_V2_ENABLED);

describe("flag OFF (no quiet-hours tables are read)", () => {
  it.each([[null], [true]])("allows with the category %s", async (pref) => {
    answer({ pref });
    await expect(allow(NIGHT)).resolves.toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("respects a category switched off", async () => {
    answer({ pref: false });
    await expect(allow()).resolves.toBe(false);
  });
});

describe("flag ON", () => {
  beforeEach(() => {
    process.env.NOTIF_V2_ENABLED = "true";
  });
  it("allows during the day and stays silent in the default quiet hours", async () => {
    answer();
    await expect(allow(DAY)).resolves.toBe(true);
    await expect(allow(NIGHT)).resolves.toBe(false);
  });
  it("allows at night when the member turned quiet hours off", async () => {
    answer({ quiet: { quiet_hours_enabled: false, quiet_start: 22, quiet_end: 8, timezone: null } });
    await expect(allow(NIGHT)).resolves.toBe(true);
  });
  it("a category switched off wins over the time of day", async () => {
    answer({ pref: false });
    await expect(allow(DAY)).resolves.toBe(false);
  });
});
