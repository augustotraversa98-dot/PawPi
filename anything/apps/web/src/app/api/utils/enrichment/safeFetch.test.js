import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// SSRF guard for the server-side enrichment document fetches (#2). assertAllowedFetchUrl only
// permits https to the app's own storage hosts and refuses IP-literal / private / internal targets;
// safeFetch additionally re-validates every redirect hop before following it.

import {
  assertAllowedFetchUrl,
  safeFetch,
  allowedFetchHosts,
  BlockedFetchUrlError,
} from "./safeFetch";

const OLD_ENV = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_URL = "https://proj123.supabase.co";
  delete process.env.ENRICHMENT_FETCH_ALLOWED_HOSTS;
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("allowedFetchHosts", () => {
  it("includes the SUPABASE_URL host, the static stores, and env additions", () => {
    process.env.ENRICHMENT_FETCH_ALLOWED_HOSTS = "cdn.example.com, extra.test";
    const hosts = allowedFetchHosts();
    expect(hosts.has("proj123.supabase.co")).toBe(true);
    expect(hosts.has("api.anything.com")).toBe(true);
    expect(hosts.has("ucarecdn.com")).toBe(true);
    expect(hosts.has("cdn.example.com")).toBe(true);
    expect(hosts.has("extra.test")).toBe(true);
  });
});

describe("assertAllowedFetchUrl", () => {
  it("allows an https url on the Supabase storage host", () => {
    const u = assertAllowedFetchUrl(
      "https://proj123.supabase.co/storage/v1/object/public/media/uploads/x.pdf",
    );
    expect(u.hostname).toBe("proj123.supabase.co");
  });

  it("rejects the cloud metadata endpoint", () => {
    expect(() => assertAllowedFetchUrl("http://169.254.169.254/latest/meta-data/")).toThrow(
      BlockedFetchUrlError,
    );
  });

  it("rejects localhost and private ranges", () => {
    for (const bad of [
      "http://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.10/x",
      "https://172.16.4.4/x",
      "https://[::1]/x",
    ]) {
      expect(() => assertAllowedFetchUrl(bad), bad).toThrow(BlockedFetchUrlError);
    }
  });

  it("rejects a non-allowlisted public host", () => {
    expect(() => assertAllowedFetchUrl("https://evil.example.com/x")).toThrow(BlockedFetchUrlError);
  });

  it("rejects non-https schemes", () => {
    expect(() => assertAllowedFetchUrl("http://proj123.supabase.co/x")).toThrow(BlockedFetchUrlError);
    expect(() => assertAllowedFetchUrl("file:///etc/passwd")).toThrow(BlockedFetchUrlError);
  });
});

describe("safeFetch", () => {
  it("fetches an allowlisted url with redirect:manual and returns the response", async () => {
    const okRes = { status: 200, ok: true, headers: new Map() };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okRes);
    const res = await safeFetch("https://proj123.supabase.co/media/a.pdf");
    expect(res).toBe(okRes);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("never issues a fetch for a blocked target", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      BlockedFetchUrlError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to follow a redirect that points at an internal address", async () => {
    const redirect = {
      status: 302,
      ok: false,
      headers: new Map([["location", "http://169.254.169.254/"]]),
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(redirect);
    await expect(safeFetch("https://proj123.supabase.co/media/a.pdf")).rejects.toThrow(
      BlockedFetchUrlError,
    );
    // The first hop was fetched; the redirect target was rejected before a second fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
