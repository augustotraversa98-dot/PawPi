import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// getVideoRoom (ticket: Daily.co telehealth adapter). Proves: unset keys → dormant
// VideoNotConfiguredError regardless of provider; the 'generic' adapter is untouched; the
// 'daily' adapter is configured with a SINGLE key (no VIDEO_API_SECRET required), creates a
// private room + meeting token via the real Daily REST shape, reuses an existing room_ref
// instead of creating a duplicate, and falls back to creating a new room when the stored
// room_ref 404s (expired/deleted). global.fetch mocked for the Daily calls.

import {
  getVideoRoom,
  VideoNotConfiguredError,
  dailyExpirySeconds,
  isTelehealthSessionExpired,
} from "./index";

let savedProvider, savedKey, savedSecret, savedFetch;
beforeEach(() => {
  savedProvider = process.env.VIDEO_PROVIDER;
  savedKey = process.env.VIDEO_API_KEY;
  savedSecret = process.env.VIDEO_API_SECRET;
  savedFetch = global.fetch;
});
afterEach(() => {
  if (savedProvider === undefined) delete process.env.VIDEO_PROVIDER;
  else process.env.VIDEO_PROVIDER = savedProvider;
  if (savedKey === undefined) delete process.env.VIDEO_API_KEY;
  else process.env.VIDEO_API_KEY = savedKey;
  if (savedSecret === undefined) delete process.env.VIDEO_API_SECRET;
  else process.env.VIDEO_API_SECRET = savedSecret;
  global.fetch = savedFetch;
});

describe("getVideoRoom — dormant behind keys", () => {
  it("no keys at all → VideoNotConfiguredError (default 'generic' provider)", async () => {
    delete process.env.VIDEO_PROVIDER;
    delete process.env.VIDEO_API_KEY;
    delete process.env.VIDEO_API_SECRET;
    await expect(getVideoRoom({ session: { id: 1 } })).rejects.toBeInstanceOf(
      VideoNotConfiguredError,
    );
  });

  it("VIDEO_PROVIDER=daily with only VIDEO_API_KEY unset → still dormant", async () => {
    process.env.VIDEO_PROVIDER = "daily";
    delete process.env.VIDEO_API_KEY;
    delete process.env.VIDEO_API_SECRET;
    await expect(getVideoRoom({ session: { id: 1 } })).rejects.toBeInstanceOf(
      VideoNotConfiguredError,
    );
  });
});

describe("getVideoRoom — 'generic' adapter is unchanged", () => {
  it("still requires BOTH key and secret, and never calls fetch", async () => {
    delete process.env.VIDEO_PROVIDER;
    process.env.VIDEO_API_KEY = "vk";
    delete process.env.VIDEO_API_SECRET;
    await expect(getVideoRoom({ session: { id: 1 } })).rejects.toBeInstanceOf(
      VideoNotConfiguredError,
    );

    process.env.VIDEO_API_SECRET = "vs";
    global.fetch = vi.fn();
    const room = await getVideoRoom({ session: { id: 1 } });
    expect(room.joinUrl).toContain("pawpi-consult-1");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("getVideoRoom — 'daily' adapter", () => {
  beforeEach(() => {
    process.env.VIDEO_PROVIDER = "daily";
    process.env.VIDEO_API_KEY = "daily-key";
    delete process.env.VIDEO_API_SECRET;
  });

  it("configured with only VIDEO_API_KEY set (no secret) → creates a room + token", async () => {
    global.fetch = vi.fn(async (url, opts) => {
      if (url === "https://api.daily.co/v1/rooms" && opts.method === "POST") {
        expect(opts.headers.Authorization).toBe("Bearer daily-key");
        const body = JSON.parse(opts.body);
        expect(body.privacy).toBe("private");
        expect(body.properties.enable_chat).toBe(true);
        expect(body.properties.enable_screenshare).toBe(true);
        expect(typeof body.properties.exp).toBe("number");
        return {
          ok: true,
          json: async () => ({ name: "new-room", url: "https://pawpi.daily.co/new-room" }),
        };
      }
      if (url === "https://api.daily.co/v1/meeting-tokens" && opts.method === "POST") {
        const body = JSON.parse(opts.body);
        expect(body.properties.room_name).toBe("new-room");
        expect(body.properties.user_name).toBe("Rex's Owner");
        return { ok: true, json: async () => ({ token: "tok123" }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const persistRoomRef = vi.fn().mockResolvedValue(undefined);
    const room = await getVideoRoom({
      session: { id: 9, room_ref: null },
      participantName: "Rex's Owner",
      persistRoomRef,
    });

    expect(room.room).toBe("new-room");
    expect(room.token).toBe("tok123");
    expect(room.joinUrl).toBe("https://pawpi.daily.co/new-room?t=tok123");
    expect(persistRoomRef).toHaveBeenCalledWith("new-room");
  });

  it("reuses an existing room_ref instead of creating a duplicate room", async () => {
    const roomsCalls = [];
    global.fetch = vi.fn(async (url, opts) => {
      if (url === "https://api.daily.co/v1/rooms/existing-room") {
        roomsCalls.push(url);
        return {
          ok: true,
          json: async () => ({ name: "existing-room", url: "https://pawpi.daily.co/existing-room" }),
        };
      }
      if (url === "https://api.daily.co/v1/meeting-tokens" && opts.method === "POST") {
        return { ok: true, json: async () => ({ token: "tok456" }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const persistRoomRef = vi.fn();
    const room = await getVideoRoom({
      session: { id: 9, room_ref: "existing-room" },
      persistRoomRef,
    });

    expect(roomsCalls).toEqual(["https://api.daily.co/v1/rooms/existing-room"]);
    expect(room.joinUrl).toBe("https://pawpi.daily.co/existing-room?t=tok456");
    // No new room was created, so the reuse path never persists a room_ref.
    expect(persistRoomRef).not.toHaveBeenCalled();
  });

  it("a stale room_ref that 404s falls back to creating (and persisting) a new room", async () => {
    global.fetch = vi.fn(async (url, opts) => {
      if (url === "https://api.daily.co/v1/rooms/gone-room") {
        return { status: 404, ok: false, json: async () => ({}) };
      }
      if (url === "https://api.daily.co/v1/rooms" && opts.method === "POST") {
        return {
          ok: true,
          json: async () => ({ name: "fresh-room", url: "https://pawpi.daily.co/fresh-room" }),
        };
      }
      if (url === "https://api.daily.co/v1/meeting-tokens") {
        return { ok: true, json: async () => ({ token: "tok789" }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const persistRoomRef = vi.fn().mockResolvedValue(undefined);
    const room = await getVideoRoom({
      session: { id: 9, room_ref: "gone-room" },
      persistRoomRef,
    });

    expect(room.room).toBe("fresh-room");
    expect(persistRoomRef).toHaveBeenCalledWith("fresh-room");
  });

  it("mints a token exp matching the room's exp derived from the session's scheduled end", async () => {
    let roomExp, tokenExp;
    global.fetch = vi.fn(async (url, opts) => {
      if (url === "https://api.daily.co/v1/rooms" && opts.method === "POST") {
        const body = JSON.parse(opts.body);
        roomExp = body.properties.exp;
        return { ok: true, json: async () => ({ name: "r", url: "https://pawpi.daily.co/r" }) };
      }
      if (url === "https://api.daily.co/v1/meeting-tokens") {
        const body = JSON.parse(opts.body);
        tokenExp = body.properties.exp;
        return { ok: true, json: async () => ({ token: "t" }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const scheduledEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await getVideoRoom({ session: { id: 1, scheduled_end_at: scheduledEnd } });

    expect(roomExp).toBe(tokenExp);
    const expectedFloor = Math.floor(new Date(scheduledEnd).getTime() / 1000);
    expect(roomExp).toBeGreaterThan(expectedFloor); // grace window added on top
  });
});

describe("isTelehealthSessionExpired — the join-route safety net for a never-ended session", () => {
  it("no started_at → never expired (can't be genuinely in_progress without one)", () => {
    expect(isTelehealthSessionExpired({ id: 1, status: "in_progress" })).toBe(false);
  });

  it("started_at well within the default 2h TTL → not expired", () => {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30m ago
    expect(isTelehealthSessionExpired({ id: 1, started_at: startedAt })).toBe(false);
  });

  it("started_at long past the default 2h TTL → expired (the stale-test-session case)", () => {
    const startedAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(); // 6h ago
    expect(isTelehealthSessionExpired({ id: 1, started_at: startedAt })).toBe(true);
  });

  it("respects an injected nowMs so the check is deterministic in tests", () => {
    const startedAt = "2026-08-01T10:00:00.000Z";
    const justInside = new Date("2026-08-01T11:59:00.000Z").getTime(); // < 2h
    const justOutside = new Date("2026-08-01T12:01:00.000Z").getTime(); // > 2h
    expect(
      isTelehealthSessionExpired({ started_at: startedAt }, { nowMs: justInside }),
    ).toBe(false);
    expect(
      isTelehealthSessionExpired({ started_at: startedAt }, { nowMs: justOutside }),
    ).toBe(true);
  });

  it("a scheduled_end_at anchors the ceiling at started_at, not real now", () => {
    // scheduled_end_at is 10 minutes after started_at → ceiling = that + 15m grace = 25m
    // after started_at, well short of the 2h default. Confirms the window is anchored at
    // started_at (room-creation time), not recomputed against the real current instant.
    const startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3h ago (way past 2h default)
    const scheduledEnd = new Date(startedAt.getTime() + 10 * 60 * 1000).toISOString();
    expect(
      isTelehealthSessionExpired({
        started_at: startedAt.toISOString(),
        scheduled_end_at: scheduledEnd,
      }),
    ).toBe(true);
  });
});

describe("dailyExpirySeconds — nowMs override", () => {
  it("defaults to Date.now() when nowMs is omitted", () => {
    const before = Math.floor(Date.now() / 1000);
    const exp = dailyExpirySeconds({});
    expect(exp).toBeGreaterThanOrEqual(before);
  });

  it("anchors the default TTL at an explicit nowMs instead of the real clock", () => {
    const anchor = new Date("2026-01-01T00:00:00.000Z").getTime();
    const exp = dailyExpirySeconds({}, { nowMs: anchor });
    expect(exp).toBe(Math.floor((anchor + 2 * 60 * 60 * 1000) / 1000));
  });
});
