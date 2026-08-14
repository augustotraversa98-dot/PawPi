// E6 — the onboarding "start the ring" call. Never throws; posts the right shape; skips when ids
// are missing.

import { postOnboardingWelcome } from "./onboardingWelcome";

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("postOnboardingWelcome", () => {
  it("POSTs post_id + pet_id and returns the parsed body", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ welcomed: true, streak: { current_count: 1 }, welcome_actor: "pawpi_welcome" }),
    });
    const out = await postOnboardingWelcome({ postId: 10, petId: 3 });
    expect(out).toEqual({ welcomed: true, streak: { current_count: 1 }, welcome_actor: "pawpi_welcome" });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/onboarding/welcome");
    expect(JSON.parse(opts.body)).toEqual({ post_id: 10, pet_id: 3 });
  });

  it("returns null (no throw) without ids", async () => {
    expect(await postOnboardingWelcome({})).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null (no throw) on a non-ok response", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await postOnboardingWelcome({ postId: 1, petId: 2 })).toBeNull();
  });

  it("returns null (no throw) when fetch rejects", async () => {
    global.fetch.mockRejectedValue(new Error("network"));
    expect(await postOnboardingWelcome({ postId: 1, petId: 2 })).toBeNull();
  });
});
