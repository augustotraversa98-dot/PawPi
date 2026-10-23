import { describe, it, expect, vi } from "vitest";
import { warmPool, BOOT_WARM_CONNECTIONS } from "./sql";

describe("warmPool (perf audit 2026-10-23)", () => {
  it("issues one select 1 per connection, concurrently", async () => {
    const client = vi.fn(() => Promise.resolve([{ "?column?": 1 }]));
    const r = await warmPool(client, 3);
    expect(client).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ opened: 3, failed: 0 });
  });

  it("counts failures and never throws", async () => {
    const client = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("pooler busy"))
      .mockResolvedValueOnce([]);
    const r = await warmPool(client, 3);
    expect(r).toMatchObject({ opened: 2, failed: 1 });
  });

  it("warms only a few connections by default (deploy overlap)", () => {
    expect(BOOT_WARM_CONNECTIONS).toBeLessThanOrEqual(3);
  });
});
