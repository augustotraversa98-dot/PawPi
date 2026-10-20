import { GET } from "./route";
import { auth } from "@/auth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

describe("GET /api/session", () => {
  it("401 without a session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("200 { ok: true } with a live session, no DB touched", async () => {
    auth.mockResolvedValue({ user: { id: "12" } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
