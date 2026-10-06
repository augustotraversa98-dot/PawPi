import { bellBadgeCount, bellBadgeLabel } from "./bellBadge";

describe("bellBadgeCount", () => {
  it("sums local reminders, pending access requests and unread DB notifications", () => {
    expect(bellBadgeCount({ reminders: 2, pendingAccess: 1, dbUnread: 4 })).toBe(7);
  });
  it("DB notifications alone light the badge (the bug: they never did)", () => {
    expect(bellBadgeCount({ reminders: 0, pendingAccess: 0, dbUnread: 1 })).toBe(1);
  });
  it("with the server flag off (no unread_count → 0) the badge is exactly the old value", () => {
    expect(bellBadgeCount({ reminders: 3, pendingAccess: 1, dbUnread: 0 })).toBe(4);
    expect(bellBadgeCount({ reminders: 3, pendingAccess: 1 })).toBe(4);
  });
  it("ignores junk (negative, NaN, strings, undefined)", () => {
    expect(bellBadgeCount({ reminders: -3, pendingAccess: NaN, dbUnread: "5" })).toBe(0);
    expect(bellBadgeCount()).toBe(0);
  });
});

describe("bellBadgeLabel", () => {
  it("hides at 0, shows the number, caps at 9+", () => {
    expect(bellBadgeLabel(0)).toBeNull();
    expect(bellBadgeLabel(1)).toBe("1");
    expect(bellBadgeLabel(9)).toBe("9");
    expect(bellBadgeLabel(10)).toBe("9+");
    expect(bellBadgeLabel(250)).toBe("9+");
    expect(bellBadgeLabel(undefined)).toBeNull();
  });
});
