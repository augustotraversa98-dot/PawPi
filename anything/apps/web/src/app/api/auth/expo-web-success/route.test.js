import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// #4 — the WebView auth bridge must post the JWT to the app's own origin, not '*', and must be safe
// to embed in an inline <script> (no </script> breakout via provider-controlled name/email).

import { getToken } from "@auth/core/jwt";
import { GET } from "./route";

vi.mock("@auth/core/jwt", () => ({ getToken: vi.fn() }));

const OLD_ENV = { ...process.env };
const req = () => new Request("https://app.pawpi.test/api/auth/expo-web-success");

beforeEach(() => {
  process.env.AUTH_URL = "https://app.pawpi.test";
  delete process.env.APP_WEB_ORIGIN;
  process.env.NODE_ENV = "production";
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("GET /api/auth/expo-web-success", () => {
  it("posts the token to the configured origin, never '*'", async () => {
    getToken
      .mockResolvedValueOnce("raw.jwt.token") // raw:true
      .mockResolvedValueOnce({ sub: "u1", email: "a@b.com", name: "Rex" }); // parsed
    const html = await (await GET(req())).text();
    expect(html).toContain('"https://app.pawpi.test"');
    expect(html).not.toContain(", '*')");
    expect(html).not.toContain(', "*")');
    expect(html).toContain("AUTH_SUCCESS");
    expect(html).toContain("raw.jwt.token");
  });

  it("escapes </script> in the embedded payload (no breakout)", async () => {
    getToken
      .mockResolvedValueOnce("raw.jwt.token")
      .mockResolvedValueOnce({ sub: "u1", email: "a@b.com", name: "</script><script>alert(1)" });
    const html = await (await GET(req())).text();
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script>");
  });

  it("no session → AUTH_ERROR to the configured origin (401)", async () => {
    getToken.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain("AUTH_ERROR");
    expect(html).toContain('"https://app.pawpi.test"');
  });

  it("in production with no configured origin, refuses to broadcast the token", async () => {
    delete process.env.AUTH_URL;
    delete process.env.APP_WEB_ORIGIN;
    getToken.mockResolvedValueOnce("raw.jwt.token").mockResolvedValueOnce({ sub: "u1" });
    const res = await GET(req());
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).not.toContain("raw.jwt.token");
    expect(html).not.toContain(", '*')");
  });

  it("allows the '*' fallback only in development", async () => {
    delete process.env.AUTH_URL;
    delete process.env.APP_WEB_ORIGIN;
    process.env.NODE_ENV = "development";
    getToken
      .mockResolvedValueOnce("raw.jwt.token")
      .mockResolvedValueOnce({ sub: "u1", email: "a@b.com", name: "Rex" });
    const html = await (await GET(req())).text();
    expect(html).toContain('"*"');
  });
});
