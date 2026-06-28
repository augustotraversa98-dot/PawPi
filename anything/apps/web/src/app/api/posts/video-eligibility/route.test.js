import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Route contract for GET /api/posts/video-eligibility. auth + the user_profiles
// resolver are mocked at the module boundary — no live DB. Eligibility itself is
// the real (pure) computation, driven by VIDEO_ROLLOUT_PCT so we can pin the edges.

import { GET } from "./route";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const req = () => new Request("http://localhost/api/posts/video-eligibility");
const today = () => new Date().toISOString().split("T")[0];

const ORIGINAL_PCT = process.env.VIDEO_ROLLOUT_PCT;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  if (ORIGINAL_PCT === undefined) delete process.env.VIDEO_ROLLOUT_PCT;
  else process.env.VIDEO_ROLLOUT_PCT = ORIGINAL_PCT;
});

describe("GET /api/posts/video-eligibility", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(resolveUserId).not.toHaveBeenCalled();
  });

  it("404 when the user has no profile", async () => {
    auth.mockResolvedValue({ user: { id: 7 } });
    resolveUserId.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("eligible:true at 100% rollout, with today's date", async () => {
    process.env.VIDEO_ROLLOUT_PCT = "100";
    auth.mockResolvedValue({ user: { id: 7 } });
    resolveUserId.mockResolvedValue(99);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ eligible: true, date: today() });
  });

  it("eligible:false at 0% rollout", async () => {
    process.env.VIDEO_ROLLOUT_PCT = "0";
    auth.mockResolvedValue({ user: { id: 7 } });
    resolveUserId.mockResolvedValue(99);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.date).toBe(today());
  });
});
