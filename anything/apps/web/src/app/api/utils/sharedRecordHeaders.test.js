import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { sharedRecordHeaders } from "./sharedRecordHeaders";

const app = new Hono();
app.use("*", sharedRecordHeaders());
app.get("*", () => new Response("page", { headers: { "Cache-Control": "public, max-age=60" } }));

describe("shared record page headers", () => {
  it.each(["/shared-record", "/shared-record/", "/shared-record?lang=en", "/Shared-Record", "/shared-record.data"])(
    "%s is never cached, indexed or passed on as a referrer",
    async (path) => {
      const res = await app.request(path);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );

  it.each(["/", "/shared-records", "/api/public/record-link/open", "/privacy"])("leaves %s alone", async (path) => {
    const res = await app.request(path);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  it("is registered on the server", () => {
    const server = readFileSync(resolve(__dirname, "../../../../__create/index.ts"), "utf8");
    expect(server).toContain("app.use('*', sharedRecordHeaders());");
  });
});
