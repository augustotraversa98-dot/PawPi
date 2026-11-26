// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import {
  agentDiscovery,
  linkHeader,
  prefersMarkdown,
  AI_CATALOG,
  AI_CATALOG_PATH,
  API_CATALOG,
  API_CATALOG_PATH,
  SKILLS_INDEX_PATH,
} from "./agentDiscovery.js";
import { apiNotFound } from "./apiNotFound.js";
import { blockProbePaths } from "./probePaths.js";
import { securityHeaders } from "./securityHeaders.js";
import { HOME_COPY } from "@/lib/home/copy";
import { appStoreUrl } from "@/lib/brand/tokens";
import { LEGAL_TITLES } from "@/lib/legal/titles";

const web = resolve(__dirname, "../../../..");
const SPA_HTML = "<!doctype html><html><body>spa</body></html>";
const PAGES = ["/", "/privacy", "/terms", "/eula", "/support"];
const BROWSER_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";

// Mirrors the wiring in __create/index.ts: security headers, probe guard, agent discovery, the real /api
// routes + JSON 404, then a stand-in for static files and the React Router catch-all.
function buildApp({ discovery = true } = {}) {
  const api = new Hono();
  api.get("/pets", (c) => c.json({ pets: [] }, 200, { "Cache-Control": "no-store" }));
  api.post("/pets", (c) => c.json({ created: true }, 201));
  api.get("/health/deep", (c) => c.json({ ok: true }));

  const app = new Hono();
  app.use("*", securityHeaders());
  app.use("*", blockProbePaths());
  if (discovery) app.use("*", agentDiscovery());
  app.route("/api", api);
  app.all("/api/*", apiNotFound);
  app.all("*", (c) => c.html(SPA_HTML));
  return app;
}

const app = buildApp();
const without = buildApp({ discovery: false });

async function snapshot(target, path, init) {
  const res = await target.request(path, init);
  return {
    status: res.status,
    // The CSP nonce differs on every response by design.
    headers: [...res.headers]
      .map(([name, value]) => [name, value.replace(/'nonce-[^']+'/, "'nonce-*'")])
      .sort(),
    body: Buffer.from(await res.arrayBuffer()).toString("base64"),
  };
}

const markdown = (path, accept = "text/markdown") =>
  app.request(path, { headers: { accept } });

describe("prefersMarkdown", () => {
  it.each([
    "text/markdown",
    "TEXT/Markdown",
    "text/markdown; charset=utf-8",
    "text/markdown, text/html;q=0.9",
    "text/markdown, */*",
    "text/markdown, text/html",
    "text/markdown;q=0.8, */*;q=0.5",
    "text/html;q=0.5, text/markdown;q=0.6",
  ])("markdown for %j", (accept) => {
    expect(prefersMarkdown(accept)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "*/*",
    "text/*",
    "text/html",
    BROWSER_ACCEPT,
    "application/json",
    "text/markdown;q=0",
    "text/markdown;q=banana",
    "text/markdown;q=2",
    "text/markdown;q=0.5, text/html",
    "text/markdown;q=0.5, */*",
    "text/html, text/markdown",
    "text/x-markdown",
  ])("HTML for %j", (accept) => {
    expect(prefersMarkdown(accept)).toBe(false);
  });
});

describe("Link headers", () => {
  it.each(["GET", "HEAD"])("%s / carries every relation", async (method) => {
    const res = await app.request("/", { method });
    expect(res.status).toBe(200);
    expect(res.headers.get("link")).toBe(
      [
        '</sitemap.xml>; rel="sitemap"; type="application/xml"',
        '</privacy>; rel="privacy-policy"',
        '</terms>; rel="terms-of-service"',
        '</support>; rel="service-doc"',
        '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
        '</>; rel="alternate"; type="text/markdown"',
      ].join(", "),
    );
  });

  it.each(PAGES)("%s has it, with its own markdown alternate in the same language", async (path) => {
    const es = await app.request(path);
    expect(es.headers.get("link")).toContain(`<${path}>; rel="alternate"; type="text/markdown"`);
    const en = await app.request(`${path}?lang=en`);
    expect(en.headers.get("link")).toContain(`<${path}?lang=en>; rel="alternate"`);
    expect(en.headers.get("link")).toContain('</privacy?lang=en>; rel="privacy-policy"');
  });

  it("only points at things that exist", async () => {
    const targets = [...linkHeader("/", "es").matchAll(/<([^>]+)>/g)].map((m) => m[1]);
    for (const target of targets) {
      if (target === "/sitemap.xml") expect(existsSync(resolve(web, "public/sitemap.xml"))).toBe(true);
      else if (target === API_CATALOG_PATH) expect((await app.request(target)).status).toBe(200);
      else if (target !== "/") expect(existsSync(resolve(web, `src/app${target}/page.jsx`))).toBe(true);
    }
  });

  it.each(["/api/pets", "/api/health/deep", "/api/nope", "/provider", "/account/signin"])(
    "is absent on %s",
    async (path) => {
      const res = await app.request(path);
      expect(res.headers.get("link")).toBeNull();
    },
  );
});

describe("markdown negotiation", () => {
  it.each(PAGES)("%s: markdown with its headers when asked", async (path) => {
    const res = await markdown(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary")).toBe("Accept");
    expect(res.headers.get("link")).toContain('rel="api-catalog"');
    expect(res.headers.get("link")).not.toContain('rel="alternate"');
    // security headers still apply
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBeNull();
    const body = await res.text();
    expect(body.startsWith("# ")).toBe(true);
    expect(body).not.toContain("<html");
    expect(res.headers.get("x-markdown-tokens")).toBe(String(Math.ceil(body.length / 4)));
  });

  it.each(PAGES)("%s: HTML stays the default, now with Vary: Accept", async (path) => {
    for (const accept of [undefined, "*/*", "text/html", BROWSER_ACCEPT]) {
      const res = await app.request(path, { headers: accept ? { accept } : {} });
      expect(res.headers.get("content-type")).toMatch(/^text\/html/);
      expect(res.headers.get("vary")).toBe("Accept");
      expect(res.headers.get("x-markdown-tokens")).toBeNull();
      expect(await res.text()).toBe(SPA_HTML);
    }
  });

  it("keeps an existing Vary value from the page handler", async () => {
    const other = new Hono();
    other.use("*", agentDiscovery());
    other.all("*", (c) => c.html(SPA_HTML, 200, { Vary: "Origin" }));
    const res = await other.request("/");
    expect(res.headers.get("vary")).toBe("Origin, Accept");
  });

  it("HEAD mirrors GET and has no body", async () => {
    const res = await app.request("/", { method: "HEAD", headers: { accept: "text/markdown" } });
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe("");
  });

  it("treats a trailing slash like the page itself", async () => {
    const res = await markdown("/privacy/");
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });

  it("leaves other pages alone", async () => {
    for (const path of ["/provider", "/account/signin", "/p/tag/abc", "/robots.txt", "/privacy/x"]) {
      expect(await snapshot(app, path, { headers: { accept: "text/markdown" } })).toEqual(
        await snapshot(without, path, { headers: { accept: "text/markdown" } }),
      );
    }
  });

  it.each([
    ["es", ""],
    ["en", "?lang=en"],
  ])("homepage (%s): sections, captions and the App Store link, from the shared copy", async (lang, q) => {
    const body = await (await markdown(`/${q}`)).text();
    const t = HOME_COPY[lang];
    expect(body.startsWith(`# ${t.hero.title.join(" ")}\n`)).toBe(true);
    expect(body).toContain(appStoreUrl(lang));
    for (const text of [
      t.hero.sub,
      ...t.features.flatMap((f) => [f.title, f.body]),
      ...t.daily.map((d) => d.title),
      ...t.sections.flatMap((s) => [s.title, ...s.bullets, s.note].filter(Boolean)),
      ...t.audiences.flatMap((a) => [a.title, a.body, a.cta.label]),
      t.closing.title,
      t.closing.body,
    ]) {
      expect(body).toContain(text);
    }
    expect(body).not.toMatch(/coming soon|pr[oó]ximamente/i);
  });

  it.each(["privacy", "terms", "eula", "support"])("/%s: the page's own markdown, per language", async (page) => {
    for (const [lang, q] of [
      ["es", ""],
      ["en", "?lang=en"],
      ["es", "?lang=fr"],
    ]) {
      const body = await (await markdown(`/${page}${q}`)).text();
      const source = readFileSync(resolve(web, `src/content/legal/${page}.${lang}.md`), "utf8");
      expect(body.startsWith(`# ${LEGAL_TITLES[page][lang]}\n`)).toBe(true);
      expect(body).toContain(source.trim());
      expect(body.includes(appStoreUrl(lang))).toBe(page === "support");
    }
  });
});

describe("/api/* is byte-identical to before", () => {
  const PATHS = ["/api/pets", "/api/pets?lang=en", "/api/health/deep", "/api/nope", "/api", "/api/privacy"];
  const ACCEPTS = [undefined, "text/markdown", "text/markdown, text/html;q=0.9", BROWSER_ACCEPT];

  it.each(PATHS)("GET and HEAD %s, whatever the Accept header", async (path) => {
    for (const method of ["GET", "HEAD"]) {
      for (const accept of ACCEPTS) {
        const init = { method, headers: accept ? { accept } : {} };
        const after = await snapshot(app, path, init);
        expect(after).toEqual(await snapshot(without, path, init));
        const names = after.headers.map(([name]) => name);
        for (const name of ["link", "vary", "x-markdown-tokens"]) expect(names).not.toContain(name);
      }
    }
  });
});

describe("only GET and HEAD are affected", () => {
  const PATHS = [...PAGES, API_CATALOG_PATH, SKILLS_INDEX_PATH, AI_CATALOG_PATH, "/api/pets"];

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("%s passes through untouched", async (method) => {
    for (const path of PATHS) {
      const init = { method, headers: { accept: "text/markdown" } };
      expect(await snapshot(app, path, init)).toEqual(await snapshot(without, path, init));
    }
  });
});

describe("/.well-known documents", () => {
  const get = async (path, init) => {
    const res = await app.request(path, init);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBeNull();
    return res;
  };

  it("API catalog: an RFC 9727 linkset naming only the real health endpoint", async () => {
    const res = await get(API_CATALOG_PATH);
    expect(res.headers.get("content-type")).toBe("application/linkset+json");
    expect(res.headers.get("link")).toBe('</.well-known/api-catalog>; rel="api-catalog"');
    const body = await res.json();
    expect(body).toEqual({
      linkset: [
        {
          anchor: "https://www.pawpi.info/api/health/deep",
          status: [{ href: "https://www.pawpi.info/api/health/deep", type: "application/json" }],
        },
      ],
    });
    // No OpenAPI document exists, so none may be advertised.
    expect(JSON.stringify(API_CATALOG)).not.toMatch(/service-desc|openapi/i);
    expect(existsSync(resolve(web, "src/app/api/health/deep/route.js"))).toBe(true);
  });

  it("agent skills index: valid and empty", async () => {
    const res = await get(SKILLS_INDEX_PATH);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({
      $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      skills: [],
    });
  });

  it("ARD manifest: host, and entries that follow the schema", async () => {
    const res = await get(AI_CATALOG_PATH);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json();
    expect(typeof body.specVersion).toBe("string");
    expect(body.specVersion).not.toBe("");
    expect(body.host.displayName).toBe("PawPi");
    expect(body.host.identifier).toBeTruthy();
    expect(body.entries.length).toBeGreaterThan(0);
    for (const entry of body.entries) {
      expect(entry.identifier).toMatch(/^urn:air:pawpi\.info:[a-z0-9-]+:[a-z0-9-]+$/);
      expect(entry.displayName).toBeTruthy();
      expect(entry.type).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
      expect(["url", "data"].filter((k) => k in entry)).toHaveLength(1);
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);
      // Nothing PawPi does not have.
      expect(entry.type).not.toMatch(/mcp|a2a|openapi/i);
      // every url we advertise is served here
      expect((await app.request(new URL(entry.url).pathname)).status).toBe(200);
    }
    expect(body).toEqual(AI_CATALOG);
  });

  it.each([API_CATALOG_PATH, SKILLS_INDEX_PATH, AI_CATALOG_PATH])("HEAD %s works", async (path) => {
    const res = await get(path, { method: "HEAD" });
    expect(await res.text()).toBe("");
  });

  it("leaves every other /.well-known path as it was", async () => {
    for (const path of ["/.well-known/apple-app-site-association", "/.well-known/mcp.json", "/.well-known/api-catalog/x"]) {
      expect(await snapshot(app, path)).toEqual(await snapshot(without, path));
    }
  });
});

describe("registration in __create/index.ts", () => {
  it("sits after the probe guard and before the API routes and the page handler", () => {
    const source = readFileSync(resolve(web, "__create/index.ts"), "utf8");
    const at = (needle) => {
      const i = source.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    expect(at("app.use('*', agentDiscovery())")).toBeGreaterThan(at("app.use('*', blockProbePaths())"));
    expect(at("app.use('*', agentDiscovery())")).toBeLessThan(at("app.route(API_BASENAME, api)"));
    expect(at("app.use('*', agentDiscovery())")).toBeLessThan(at("createHonoServer({"));
  });
});
