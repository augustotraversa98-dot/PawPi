// @vitest-environment node
import { describe, it, expect } from "vitest";
import { anonymousSender, senderForToken, visitorAddress } from "./senderAddress";

// The finder limits are only as good as this: a sender must not be able to pick the address they are counted under.

const from = (headers) => new Request("http://localhost/x", { headers });
const CLOUDFLARE = "172.64.10.20";
const CLOUDFLARE_V6 = "2606:4700::6810:84e5";

describe("visitorAddress", () => {
  it("takes the address Railway saw, whatever X-Forwarded-For claims", () => {
    expect(visitorAddress(from({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("203.0.113.9");
  });

  it("without X-Real-IP uses the LAST forwarded entry, never the first (which the client writes)", () => {
    expect(visitorAddress(from({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(visitorAddress(from({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("ignores CF-Connecting-IP when the caller reached us directly", () => {
    expect(visitorAddress(from({ "x-real-ip": "203.0.113.9", "cf-connecting-ip": "1.1.1.1" }))).toBe("203.0.113.9");
  });

  it.each([CLOUDFLARE, CLOUDFLARE_V6, `::ffff:${CLOUDFLARE}`])(
    "believes CF-Connecting-IP when %s (Cloudflare) connected to Railway",
    (peer) => {
      expect(visitorAddress(from({ "x-real-ip": peer, "cf-connecting-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    },
  );

  it("falls back to the Cloudflare address when it names no visitor", () => {
    expect(visitorAddress(from({ "x-real-ip": CLOUDFLARE, "cf-connecting-ip": "nonsense" }))).toBe(CLOUDFLARE);
  });

  it.each([{}, { "x-forwarded-for": "unknown" }, { "cf-connecting-ip": "198.51.100.7" }])(
    "is null when no proxy vouches for an address (%o)",
    (headers) => {
      expect(visitorAddress(from(headers))).toBeNull();
      expect(anonymousSender(from(headers))).toBeNull();
    },
  );
});

describe("anonymousSender", () => {
  const sender = (address) => anonymousSender(from({ "x-real-ip": address }));

  it("is stable, separates addresses, and never contains the address", () => {
    expect(sender("203.0.113.9")).toBe(sender("203.0.113.9"));
    expect(sender("203.0.113.9")).not.toBe(sender("203.0.113.10"));
    expect(sender("203.0.113.9")).toMatch(/^ip:[0-9a-f]{32}$/);
  });

  it("counts a whole IPv6 /64 as one sender, however it is written", () => {
    const one = sender("2001:db8:1:2::1");
    expect(sender("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe(one);
    expect(sender("2001:0DB8:0001:0002:0000:0000:0000:0042")).toBe(one);
    expect(sender("2001:db8:1:3::1")).not.toBe(one);
    expect(sender("2001:db8::1")).toBe(sender("2001:db8:0:0:1::"));
  });

  it("counts an IPv4-mapped address as the IPv4 one", () => {
    expect(sender("::ffff:203.0.113.9")).toBe(sender("203.0.113.9"));
  });

  it("senderForToken separates links without storing the token", () => {
    const base = sender("203.0.113.9");
    expect(senderForToken(base, "TAG1")).not.toBe(senderForToken(base, "TAG2"));
    expect(senderForToken(base, "SECRETTOKEN")).not.toContain("SECRETTOKEN");
  });
});
