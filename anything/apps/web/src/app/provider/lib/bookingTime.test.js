import { describe, it, expect } from "vitest";
import { formatBookingWhen } from "./bookingTime";

describe("formatBookingWhen", () => {
  it("renders wall-clock date + time with no zone conversion", () => {
    expect(
      formatBookingWhen({ appointment_date: "2026-08-15", appointment_time: "14:30" }),
    ).toBe("15 Aug 2026 · 14:30");
  });

  it("drops seconds and pads nothing that wasn't in the stored time", () => {
    expect(
      formatBookingWhen({ appointment_date: "2026-07-01", appointment_time: "09:00:00" }),
    ).toBe("1 Jul 2026 · 09:00");
  });

  it("tolerates a full ISO appointment_date without leaking zeros / Z", () => {
    const out = formatBookingWhen({
      appointment_date: "2026-08-15T03:00:00.000Z",
      appointment_time: "14:30",
    });
    expect(out).toBe("15 Aug 2026 · 14:30");
    expect(out).not.toMatch(/T\d{2}:\d{2}/);
    expect(out).not.toMatch(/Z/);
  });

  it("prefers start_at, rendered in the provider's timezone", () => {
    // 2026-08-15T22:30Z is 19:30 in Buenos Aires (UTC-3).
    const out = formatBookingWhen(
      { start_at: "2026-08-15T22:30:00.000Z" },
      "America/Argentina/Buenos_Aires",
    );
    expect(out).toBe("15 Aug 2026 · 19:30");
  });

  it("returns an em-dash when there is nothing to show", () => {
    expect(formatBookingWhen({})).toBe("—");
    expect(formatBookingWhen(null)).toBe("—");
  });
});
