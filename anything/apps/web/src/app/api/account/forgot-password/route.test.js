import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/account/forgot-password — starts a self-service reset.
//
// The property these tests exist to protect is RESPONSE UNIFORMITY: unknown address, known
// address, throttled, and email-vendor-down must all be indistinguishable to the caller. Any
// difference turns this endpoint into an account-existence oracle.

import { POST } from "./route";
import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/email";
import { hashResetToken } from "@/app/api/utils/passwordResetToken";

// `getActiveTx` models "no request transaction is open", which is the unit-test reality (nothing
// here calls sql.begin). withSavepoint then runs the callback directly — see requestContext.
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn(), getActiveTx: () => null }));
vi.mock("@/app/api/utils/email", () => ({ sendEmail: vi.fn() }));

const GENERIC = {
  ok: true,
  message:
    "If an account exists for that email, we've sent a link to reset your password.",
};

const post = (body, headers = {}) =>
  new Request("http://localhost/api/account/forgot-password", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** The route makes two DB calls: (1) look up the user, (2) mint the token. */
function mockDb({ user, tokenId = 1 }) {
  sql.mockReset();
  sql.mockImplementation((strings) => {
    const query = strings.join(" ");
    if (query.includes("FROM auth_users")) {
      return Promise.resolve(user ? [user] : []);
    }
    if (query.includes("app_create_password_reset_token")) {
      return Promise.resolve([{ id: tokenId }]);
    }
    return Promise.resolve([]);
  });
}

const USER = { id: 42, email: "owner@example.com" };
const SAVED_BASE = process.env.APP_BASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.APP_BASE_URL = "https://pawpi.test";
  sendEmail.mockResolvedValue({ sent: true, id: "msg_1" });
  mockDb({ user: USER });
});

afterEach(() => {
  if (SAVED_BASE === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = SAVED_BASE;
});

describe("POST /api/account/forgot-password — the uniform response", () => {
  it("a KNOWN address → 200 with the generic message", async () => {
    const res = await POST(post({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
  });

  it("an UNKNOWN address → the SAME 200 and the SAME body", async () => {
    mockDb({ user: null });
    const res = await POST(post({ email: "nobody@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
  });

  it("an unknown address mints no token and sends no email", async () => {
    mockDb({ user: null });
    await POST(post({ email: "nobody@example.com" }));
    expect(sendEmail).not.toHaveBeenCalled();
    const queries = sql.mock.calls.map((c) => c[0].join(" "));
    expect(queries.some((q) => q.includes("app_create_password_reset_token"))).toBe(
      false,
    );
  });

  it("a THROTTLED account (helper returns null) still answers identically", async () => {
    mockDb({ user: USER, tokenId: null });
    const res = await POST(post({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a DB failure still answers 200 with the generic body (never a 500 oracle)", async () => {
    sql.mockReset();
    sql.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
  });

  it("an email-vendor failure still answers 200 (the send is best-effort)", async () => {
    sendEmail.mockResolvedValue({ sent: false, reason: "send_failed" });
    const res = await POST(post({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
  });

  // The go-live gate: with EMAIL_API_KEY unset sendEmail resolves { sent:false } and logs.
  it("an UNCONFIGURED email vendor still answers 200 — no crash, no 500", async () => {
    sendEmail.mockResolvedValue({ sent: false, reason: "not_configured" });
    const res = await POST(post({ email: "owner@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC);
  });

  // The one non-uniform case, and it can't leak anything: no address was supplied to confirm.
  it("a missing email → 400 (nothing to confirm or deny)", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("a whitespace-only email → 400", async () => {
    const res = await POST(post({ email: "   " }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("a non-string email → 400", async () => {
    const res = await POST(post({ email: { $ne: null } }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("a missing body → 400", async () => {
    const res = await POST(post(undefined));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/account/forgot-password — the token", () => {
  it("mints the token through the 0069 DEFINER helper, never a direct INSERT", async () => {
    await POST(post({ email: "owner@example.com" }));
    const queries = sql.mock.calls.map((c) => c[0].join(" "));
    expect(queries.some((q) => q.includes("app_create_password_reset_token"))).toBe(
      true,
    );
    expect(queries.some((q) => /insert\s+into/i.test(q))).toBe(false);
  });

  it("passes the auth_users.id, a HASH (never the raw token), and a future expiry", async () => {
    await POST(post({ email: "owner@example.com" }));
    const call = sql.mock.calls.find((c) =>
      c[0].join(" ").includes("app_create_password_reset_token"),
    );
    const [, authUserId, tokenHash, expiresAt] = call;

    expect(authUserId).toBe(42);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    // 30-minute TTL, with generous slack for a slow CI box.
    expect(new Date(expiresAt).getTime()).toBeLessThan(Date.now() + 31 * 60 * 1000);
  });

  it("the emailed link carries the RAW token whose hash was stored", async () => {
    await POST(post({ email: "owner@example.com" }));
    const call = sql.mock.calls.find((c) =>
      c[0].join(" ").includes("app_create_password_reset_token"),
    );
    const storedHash = call[2];

    const { text } = sendEmail.mock.calls[0][0];
    const raw = decodeURIComponent(
      text.match(/reset-password\?token=([^\s]+)/)[1],
    );
    expect(hashResetToken(raw)).toBe(storedHash);
    // …and the stored value is emphatically not the token itself.
    expect(storedHash).not.toBe(raw);
  });

  it("a fresh token is minted per request", async () => {
    await POST(post({ email: "owner@example.com" }));
    await POST(post({ email: "owner@example.com" }));
    const hashes = sql.mock.calls
      .filter((c) => c[0].join(" ").includes("app_create_password_reset_token"))
      .map((c) => c[2]);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it("looks the account up case-insensitively", async () => {
    const res = await POST(post({ email: "OWNER@Example.COM" }));
    expect(res.status).toBe(200);
    const lookup = sql.mock.calls.find((c) =>
      c[0].join(" ").includes("FROM auth_users"),
    );
    expect(lookup[0].join(" ")).toContain("lower(email) = lower(");
    expect(lookup[1]).toBe("OWNER@Example.COM");
  });

  it("trims the submitted address", async () => {
    await POST(post({ email: "  owner@example.com  " }));
    const lookup = sql.mock.calls.find((c) =>
      c[0].join(" ").includes("FROM auth_users"),
    );
    expect(lookup[1]).toBe("owner@example.com");
  });
});

describe("POST /api/account/forgot-password — the email", () => {
  it("goes to the address ON RECORD, not the one submitted", async () => {
    // Same account, differently-cased input: the link must go where the account actually lives.
    await POST(post({ email: "OWNER@EXAMPLE.COM" }));
    expect(sendEmail.mock.calls[0][0].to).toBe("owner@example.com");
  });

  it("links to the reset page on the CONFIGURED origin, ignoring a poisoned Host header", async () => {
    await POST(
      post(
        { email: "owner@example.com" },
        { host: "evil.test", "x-forwarded-host": "evil.test" },
      ),
    );
    const { text, html } = sendEmail.mock.calls[0][0];
    expect(text).toContain("https://pawpi.test/account/reset-password?token=");
    expect(html).toContain("https://pawpi.test/account/reset-password?token=");
    expect(text).not.toContain("evil.test");
    expect(html).not.toContain("evil.test");
  });

  it("sends both a text and an HTML part, and says the link is single-use + expiring", async () => {
    await POST(post({ email: "owner@example.com" }));
    const message = sendEmail.mock.calls[0][0];
    expect(message.subject).toBe("Reset your PawPi password");
    expect(message.text).toContain("works once and expires in 30 minutes");
    expect(message.html).toContain("expires in 30 minutes");
    expect(message.text).toContain("you can ignore this email");
  });
});
