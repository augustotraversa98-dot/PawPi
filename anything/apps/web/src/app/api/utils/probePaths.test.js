import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import { apiNotFound } from "./apiNotFound.js";
import { blockProbePaths, isProbePath, PROBE_NOT_FOUND_BODY } from "./probePaths.js";
import { routeLabel } from "../../../lib/telemetry/routes.js";

const SPA_HTML = "<!doctype html><html><body>spa</body></html>";

// Mirrors the wiring in __create/index.ts: probe guard first, then the real /api routes + JSON 404, then a stand-in for
// static files and the React Router catch-all (which answers 200 + HTML for everything — the behaviour being fixed).
function buildApp(seen) {
  const api = new Hono();
  api.get("/pets", (c) => c.json({ pets: [] }));
  api.post("/pets", (c) => c.json({ created: true }, 201));
  api.get("/pets/:petId", (c) => c.json({ id: c.req.param("petId") }));
  api.get("/health/deep", (c) => c.json({ ok: true }));
  api.get("/auth/token", (c) => c.json({ jwt: "x" }));

  const app = new Hono();
  app.use("*", async (c, next) => {
    await next();
    seen?.push({ matchedRoutes: c.req.matchedRoutes, path: c.req.path, status: c.res.status });
  });
  app.use("*", blockProbePaths());
  app.route("/api", api);
  app.all("/api/*", apiNotFound);
  app.all("*", (c) => c.html(SPA_HTML));
  return app;
}

// The paths from the Grafana traces plus the rest of the brief.
const BLOCKED = [
  "/.env",
  "/.env~",
  "/.env.local",
  "/.env.production",
  "/.git/config",
  "/.git/HEAD",
  "/.gitignore",
  "/.DS_Store",
  "/.aws/credentials",
  "/app/.env",
  "/Dockerfile",
  "/Dockerfile.prod",
  "/docker-compose.yml",
  "/docker-compose.yaml",
  "/docker-compose.override.yml",
  "/core/.env",
  "/core/config.json",
  "/core",
  "/wp-login.php",
  "/wp-admin",
  "/wp-admin/install.php",
  "/wp-content/plugins/x/readme.txt",
  "/wp-includes/js/jquery.js",
  "/wp-json/wp/v2/users",
  "/phpmyadmin",
  "/phpmyadmin/index.php",
  "/phpMyAdmin/",
  "/index.php",
  "/a/b/shell.php",
  "/xmlrpc.php",
  "/backup.sql",
  "/db/dump.sql",
  "/site.bak",
  "/index.html.bak",
  "/config.js~",
  "/index.html~",
  "/some/dir/file~",
  "/.env~/",
  // case + percent-encoding evasions
  "/DOCKERFILE",
  "/Docker-Compose.yml",
  "/WP-ADMIN",
  "/shell.PHP",
  "/BACKUP.SQL",
  "/%2eenv",
  "/%2Egit/config",
  "/.%65nv",
  "/config%7E",
  "/CORE/.env",
];

// Real routes the brief names, plus assets, well-known and the API.
const ALLOWED = [
  "/",
  "/privacy",
  "/terms",
  "/support",
  "/eula",
  "/account/signin",
  "/account/signup",
  "/account/reset-password",
  "/p/tag/abc123DEF_-xyz",
  "/p/card/abc123DEF_-xyz",
  "/provider/bookings",
  "/provider/pets/42/record",
  "/robots.txt",
  "/sitemap.xml",
  "/assets/index-AbC123.js",
  "/assets/chunk.css",
  "/.well-known/apple-app-site-association",
  "/.well-known/assetlinks.json",
  "/.well-known/security.txt",
  // lookalikes that are NOT probes
  "/corehub",
  "/hardcore",
  "/dockerfiles-are-fun",
  "/wp",
  "/phpinfo-is-not-a-thing-here",
  "/sqlite",
  "/php",
  "/backup",
];

afterEach(() => vi.restoreAllMocks());

describe("isProbePath", () => {
  it.each(BLOCKED)("blocks %s", (p) => {
    expect(isProbePath(p)).toBe(true);
  });

  it.each(ALLOWED)("allows %s", (p) => {
    expect(isProbePath(p)).toBe(false);
  });

  it("never judges /api/* (real routes; unknown ones get the JSON 404)", () => {
    for (const p of ["/api", "/api/", "/api/pets", "/api/auth/token", "/api/x.php", "/api/.env", "/api/pets/1.bak"]) {
      expect(isProbePath(p)).toBe(false);
    }
  });

  it("is safe on malformed input", () => {
    expect(isProbePath("/%E0%A4%A")).toBe(false); // bad %-escape, nothing probe-like
    expect(isProbePath("/%E0%A4%A.php")).toBe(true); // bad escape but still ends .php
    expect(isProbePath(undefined)).toBe(false);
    expect(isProbePath("")).toBe(false);
  });
});

describe("blockProbePaths middleware", () => {
  const app = buildApp();

  it.each(BLOCKED)("GET %s -> plain 404, no app HTML", async (p) => {
    const res = await app.request(p);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body).toBe(PROBE_NOT_FOUND_BODY);
    expect(body).not.toMatch(/<html|spa/i);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])("%s /.env -> 404 too", async (method) => {
    const res = await app.request("/.env", { method });
    expect(res.status).toBe(404);
  });

  it("answers the exact paths from the Grafana traces with 404", async () => {
    for (const p of ["/.env~", "/Dockerfile", "/docker-compose.yml", "/core/.env"]) {
      expect((await app.request(p)).status).toBe(404);
    }
  });

  it("the body is fixed and echoes nothing from the request", async () => {
    const res = await app.request("/.env?token=SECRET123&x=<script>", {
      headers: { authorization: "Bearer SECRET456", "x-forwarded-for": "203.0.113.9", "user-agent": "scanner/1.0" },
    });
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe("Not Found");
    for (const needle of ["SECRET", "203.0.113.9", "scanner", ".env", "script"]) {
      expect(text).not.toContain(needle);
    }
    // no headers reflect request data either
    for (const [, v] of res.headers) {
      expect(v).not.toMatch(/SECRET|203\.0\.113\.9|scanner/);
    }
  });

  it("does not log anything (no paths, bodies or IPs)", async () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await app.request("/.env", { method: "POST", body: "password=hunter2", headers: { "x-forwarded-for": "198.51.100.7" } });
    await app.request("/wp-login.php");
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it("does not read the request body", async () => {
    const res = await app.request("/.env", { method: "POST", body: "x".repeat(1024) });
    expect(res.status).toBe(404);
  });

  it.each(ALLOWED.filter((p) => !p.startsWith("/api")))("GET %s still reaches the app (200 + HTML)", async (p) => {
    const res = await app.request(p);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toBe(SPA_HTML);
  });

  it("/.well-known/apple-app-site-association is passed through for every method that could fetch it", async () => {
    for (const method of ["GET", "HEAD"]) {
      const res = await app.request("/.well-known/apple-app-site-association", { method });
      expect(res.status).toBe(200);
    }
  });

  it("API routes still work, including auth and dynamic params", async () => {
    const list = await app.request("/api/pets");
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ pets: [] });
    expect((await app.request("/api/pets", { method: "POST" })).status).toBe(201);
    expect(await (await app.request("/api/pets/7")).json()).toEqual({ id: "7" });
    expect((await app.request("/api/health/deep")).status).toBe(200);
    expect(await (await app.request("/api/auth/token")).json()).toEqual({ jwt: "x" });
  });

  it("unknown /api/* paths keep their JSON 404 (the guard leaves them to apiNotFound)", async () => {
    for (const p of ["/api/nope", "/api/x.php", "/api/.env"]) {
      const res = await app.request(p);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
      expect(await res.json()).toEqual({ error: "not_found" });
    }
  });

  it("telemetry still sees blocked probes (as 404s) but only in the bounded '/__page' bucket, never a raw path", async () => {
    const seen = [];
    const a = buildApp(seen);
    for (const p of ["/.env~", "/Dockerfile", "/core/.env", "/wp-login.php", "/random-12345.php"]) {
      await a.request(p);
    }
    expect(seen.map((s) => s.status)).toEqual([404, 404, 404, 404, 404]);
    for (const { matchedRoutes, path, status } of seen) {
      expect(routeLabel({ matchedRoutes, path, status })).toBe("/__page");
    }
  });
});

describe("real routes on disk are never classified as probes", () => {
  const appDir = resolve(__dirname, "../..");
  const publicDir = resolve(__dirname, "../../../../public");

  function walk(dir, visit, rel = "") {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, visit, relPath);
      else visit(relPath);
    }
  }

  // [param] -> a token-shaped value, [...rest] -> two segments, [[opt]] -> a value
  const fill = (rel) =>
    rel
      .replace(/\[\.\.\.[^\]]+\]/g, "a/b")
      .replace(/\[\[[^\]]+\]\]/g, "x1")
      .replace(/\[[^\]]+\]/g, "Ab3_-9xZ");

  it("every page route (src/app/**/page.jsx) passes through", () => {
    const pages = [];
    walk(appDir, (rel) => {
      if (/(^|\/)page\.(jsx|tsx|js|ts)$/.test(rel)) {
        const url = "/" + fill(rel).replace(/(^|\/)page\.(jsx|tsx|js|ts)$/, "");
        pages.push(url === "/" ? "/" : url.replace(/\/$/, ""));
      }
    });
    expect(pages.length).toBeGreaterThan(30); // sanity: we really walked the route tree
    expect(pages).toEqual(expect.arrayContaining(["/", "/privacy", "/terms", "/support", "/eula"]));
    const offenders = pages.filter(isProbePath);
    expect(offenders).toEqual([]);
  });

  it("every API route file (src/app/api/**/route.js) maps to a path the guard skips", () => {
    const routes = [];
    walk(join(appDir, "api"), (rel) => {
      if (/(^|\/)route\.(js|ts)$/.test(rel)) {
        routes.push("/api/" + fill(rel).replace(/(^|\/)route\.(js|ts)$/, ""));
      }
    });
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.filter(isProbePath)).toEqual([]);
  });

  it("every file served from public/ passes through", () => {
    const files = [];
    walk(publicDir, (rel) => files.push("/" + rel));
    expect(files).toEqual(expect.arrayContaining(["/robots.txt", "/sitemap.xml"]));
    expect(files.filter(isProbePath)).toEqual([]);
  });
});

describe("wiring in __create/index.ts", () => {
  const src = readFileSync(resolve(__dirname, "../../../../__create/index.ts"), "utf8");
  const at = (s) => src.indexOf(s);

  it("imports and registers the guard for every path", () => {
    expect(src).toMatch(/import \{ blockProbePaths \} from '\.\.\/src\/app\/api\/utils\/probePaths\.js'/);
    expect(at("app.use('*', blockProbePaths())")).toBeGreaterThan(-1);
  });

  it("runs after the security headers + metrics middleware, before auth, the API and the SPA/static handlers", () => {
    const guard = at("app.use('*', blockProbePaths())");
    expect(guard).toBeGreaterThan(at("app.use('*', securityHeaders())"));
    expect(guard).toBeGreaterThan(at("recordHttpRequest({"));
    expect(guard).toBeLessThan(at("initAuthConfig("));
    expect(guard).toBeLessThan(at("app.route(API_BASENAME, api)"));
    expect(guard).toBeLessThan(at("createHonoServer({"));
  });
});
