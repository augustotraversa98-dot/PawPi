import { describe, it, expect } from "vitest";
import { getCalendarSync, noopCalendarSync } from "./calendarSync";

// The stubbed 2-way calendar-sync hook (2.4). The default adapter is a safe no-op so
// booking flows work end-to-end with sync off; a real Google/Apple adapter slots in
// behind the same contract later.

describe("getCalendarSync", () => {
  it("returns the no-op adapter today", () => {
    expect(getCalendarSync()).toBe(noopCalendarSync);
    expect(getCalendarSync().name).toBe("noop");
  });

  it("push/update/remove resolve without throwing and report not-synced", async () => {
    const sync = getCalendarSync();
    await expect(sync.pushBooking({ id: 1 })).resolves.toMatchObject({
      synced: false,
    });
    await expect(sync.updateBooking({ id: 1 })).resolves.toMatchObject({
      synced: false,
    });
    await expect(sync.removeBooking({ id: 1 })).resolves.toMatchObject({
      synced: false,
    });
  });

  it("pullBusy returns no external busy windows (stub)", async () => {
    await expect(
      getCalendarSync().pullBusy({ providerId: 1, from: "2026-06-15", to: "2026-06-16" }),
    ).resolves.toEqual([]);
  });
});
