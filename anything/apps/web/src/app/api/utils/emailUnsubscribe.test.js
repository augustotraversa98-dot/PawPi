import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  makeUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  unsubscribeFooter,
  publicBaseUrl,
} from "./emailUnsubscribe";

const saved = { ...process.env };
beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret-123456";
  delete process.env.NOTIF_UNSUBSCRIBE_SECRET;
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.AUTH_URL;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("unsubscribe token", () => {
  it("round-trips {userId, category}", () => {
    const t = makeUnsubscribeToken(42, "winback_email");
    expect(verifyUnsubscribeToken(t)).toEqual({ userId: 42, category: "winback_email" });
  });
  it("contains no email address or other PII", () => {
    const t = makeUnsubscribeToken(42, "winback_email");
    const payload = Buffer.from(t.split(".")[0], "base64url").toString();
    expect(JSON.parse(payload)).toEqual({ u: 42, c: "winback_email" });
  });
  it("rejects a tampered payload, tampered signature, wrong key, junk and over-long input", () => {
    const t = makeUnsubscribeToken(42, "winback_email");
    const [p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ u: 43, c: "winback_email" })).toString("base64url");
    expect(verifyUnsubscribeToken(`${forged}.${s}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${p}.${s.slice(0, -2)}xx`)).toBeNull();
    expect(verifyUnsubscribeToken(`${p}.${s}.extra`)).toBeNull();
    for (const bad of ["", "abc", null, undefined, 5, `${p}.`, "x".repeat(600)]) {
      expect(verifyUnsubscribeToken(bad)).toBeNull();
    }
    process.env.AUTH_SECRET = "a-different-secret-xyz";
    expect(verifyUnsubscribeToken(t)).toBeNull();
  });
  it("only mints for a known category and a valid id", () => {
    expect(makeUnsubscribeToken(42, "weekly_digest")).toBeNull();
    expect(makeUnsubscribeToken(0, "winback_email")).toBeNull();
    expect(makeUnsubscribeToken("42", "winback_email")).toBeNull();
    expect(makeUnsubscribeToken(1.5, "winback_email")).toBeNull();
  });
  it("with NO signing key nothing can be minted or verified (so no email is ever sent)", () => {
    const t = makeUnsubscribeToken(42, "winback_email");
    delete process.env.AUTH_SECRET;
    expect(makeUnsubscribeToken(42, "winback_email")).toBeNull();
    expect(buildUnsubscribeUrl(42, "winback_email")).toBeNull();
    expect(verifyUnsubscribeToken(t)).toBeNull();
  });
  it("NOTIF_UNSUBSCRIBE_SECRET takes precedence over AUTH_SECRET", () => {
    const withAuth = makeUnsubscribeToken(42, "winback_email");
    process.env.NOTIF_UNSUBSCRIBE_SECRET = "dedicated-secret-abcdef";
    const withDedicated = makeUnsubscribeToken(42, "winback_email");
    expect(withDedicated).not.toBe(withAuth);
    expect(verifyUnsubscribeToken(withDedicated)).not.toBeNull();
  });
});

describe("url + footer", () => {
  it("builds an absolute https URL on the public base (default www.pawpi.info)", () => {
    expect(publicBaseUrl()).toBe("https://www.pawpi.info");
    const url = buildUnsubscribeUrl(42, "winback_email");
    expect(url.startsWith("https://www.pawpi.info/api/notification-prefs/email-unsubscribe?t=")).toBe(true);
    const t = decodeURIComponent(url.split("?t=")[1]);
    expect(verifyUnsubscribeToken(t)).toEqual({ userId: 42, category: "winback_email" });
  });
  it("honours PUBLIC_BASE_URL (trailing slash trimmed)", () => {
    process.env.PUBLIC_BASE_URL = "https://staging.example.com/";
    expect(publicBaseUrl()).toBe("https://staging.example.com");
  });
  it("footer is bilingual (es-AR voseo) and carries the link", () => {
    const url = "https://x/u?t=1";
    expect(unsubscribeFooter("en", url)).toContain(url);
    expect(unsubscribeFooter("en", url)).toContain("Stop them any time");
    expect(unsubscribeFooter("es", url)).toContain("Podés dejar de recibirlos");
    expect(unsubscribeFooter(null, url)).toContain("Podés"); // es-AR fallback
  });
});
