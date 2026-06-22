import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/legal/consent — records Terms/Privacy acceptance at signup (Guideline 1.2).
// Versions are SERVER-authoritative; auth id comes from the session, never the body.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/constants/legal";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/legal/consent", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sql.mockResolvedValue([{ app_record_consent: 1 }]);
});

describe("POST /api/legal/consent", () => {
  it("unauthenticated → 401 and never touches the DB", async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(post({ source: "web_signup" }));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("authenticated → 200 {ok:true}, records exactly one row", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(post({ source: "web_signup" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0][0].join(" ")).toContain("app_record_consent");
  });

  it("uses the session auth id + server version strings (params bind in order)", async () => {
    auth.mockResolvedValue(SESSION);
    await POST(post({ source: "web_signup" }));
    const [, authUserId, terms, privacy, source] = sql.mock.calls[0];
    expect(authUserId).toBe(42);
    expect(terms).toBe(TERMS_VERSION);
    expect(privacy).toBe(PRIVACY_VERSION);
    expect(source).toBe("web_signup");
  });

  it("IGNORES body-supplied versions and auth_user_id", async () => {
    auth.mockResolvedValue(SESSION);
    await POST(
      post({
        source: "mobile_signup",
        auth_user_id: 9999,
        terms_version: "1900-01-01",
        privacy_version: "1900-01-01",
      }),
    );
    const [, authUserId, terms, privacy, source] = sql.mock.calls[0];
    expect(authUserId).toBe(42); // session, not body 9999
    expect(terms).toBe(TERMS_VERSION); // constant, not body 1900-01-01
    expect(privacy).toBe(PRIVACY_VERSION);
    expect(source).toBe("mobile_signup");
  });

  it("an unknown source is stored as null (not trusted verbatim)", async () => {
    auth.mockResolvedValue(SESSION);
    await POST(post({ source: "not_a_source" }));
    expect(sql.mock.calls[0][4]).toBeNull();
  });

  it("tolerates a missing/empty body → 200, source null", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(post(undefined));
    expect(res.status).toBe(200);
    expect(sql.mock.calls[0][4]).toBeNull();
  });

  it("a DB failure → 500", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(post({ source: "web_signup" }));
    expect(res.status).toBe(500);
  });
});
