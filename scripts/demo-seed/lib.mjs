// PawPi demo-account seeder — shared library (auth + HTTP helpers).
//
// This module does the plumbing: a cookie jar, the Auth.js credentials
// sign-in flow, a Bearer-authenticated fetch wrapper, image upload, and small
// utilities the section seeders build on. No secrets live here — credentials
// and the base URL come from the environment (see config()).
//
// Runtime: Node 18+ (uses global fetch, FormData, Blob). No npm deps.

import { readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config — all secrets come from the environment, never hard-coded/committed.
// ---------------------------------------------------------------------------
export function config() {
  const BASE_URL = (
    process.env.PAWPI_BASE_URL || "https://pawpi-production.up.railway.app"
  ).replace(/\/+$/, "");
  const EMAIL = process.env.PAWPI_DEMO_EMAIL;
  const PASSWORD = process.env.PAWPI_DEMO_PASSWORD;
  if (!EMAIL || !PASSWORD) {
    console.error(
      "\nMissing credentials. Set them in your shell before running:\n" +
        "  export PAWPI_DEMO_EMAIL='augusto+demo@pawpi.info'\n" +
        "  export PAWPI_DEMO_PASSWORD='********'\n" +
        "  (optional) export PAWPI_BASE_URL='https://pawpi-production.up.railway.app'\n",
    );
    process.exit(1);
  }
  return { BASE_URL, EMAIL, PASSWORD };
}

// ---------------------------------------------------------------------------
// Cookie jar — minimal, good enough for the Auth.js sign-in dance.
// ---------------------------------------------------------------------------
class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  ingest(res) {
    // Node's fetch exposes multiple Set-Cookie via getSetCookie() (undici).
    const raw =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie")].filter(Boolean);
    for (const line of raw) {
      if (!line) continue;
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === "" || value === "deleted") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

// ---------------------------------------------------------------------------
// Auth session — holds the JWT and issues authenticated requests.
// ---------------------------------------------------------------------------
export class Session {
  constructor({ baseURL }) {
    this.baseURL = baseURL;
    this.jar = new CookieJar();
    this.jwt = null;
    this.user = null;
  }

  async #raw(pathname, init = {}) {
    const url = pathname.startsWith("http")
      ? pathname
      : `${this.baseURL}${pathname}`;
    const headers = new Headers(init.headers || {});
    const cookie = this.jar.header();
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(url, { ...init, headers, redirect: "manual" });
    this.jar.ingest(res);
    return res;
  }

  // Full Auth.js credentials sign-in: csrf -> callback -> /api/auth/token.
  async login({ email, password }) {
    // 1) CSRF token (also sets the csrf cookie in the jar).
    const csrfRes = await this.#raw("/api/auth/csrf", {
      headers: { accept: "application/json" },
    });
    if (!csrfRes.ok) throw new Error(`csrf failed: ${csrfRes.status}`);
    const { csrfToken } = await csrfRes.json();
    if (!csrfToken) throw new Error("no csrfToken in /api/auth/csrf response");

    // 2) Credentials callback — form-encoded, forwards the csrf cookie.
    const body = new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${this.baseURL}/api/auth/token`,
      json: "true",
    });
    const cbRes = await this.#raw(
      "/api/auth/callback/credentials-signin",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body,
      },
    );
    // Auth.js answers 200 (json:true) or 302; either sets the session cookie.
    if (cbRes.status >= 400) {
      const t = await cbRes.text().catch(() => "");
      throw new Error(`sign-in callback failed: ${cbRes.status} ${t.slice(0, 200)}`);
    }
    const haveSession = [...this.jar.cookies.keys()].some((k) =>
      k.includes("session-token"),
    );
    if (!haveSession) {
      const t = await cbRes.text().catch(() => "");
      throw new Error(
        `sign-in did not set a session cookie (bad credentials?). Body: ${t.slice(0, 200)}`,
      );
    }

    // 3) Exchange the session cookie for the raw JWT the mobile app uses.
    const tokRes = await this.#raw("/api/auth/token", {
      headers: { accept: "application/json" },
    });
    if (!tokRes.ok) throw new Error(`/api/auth/token failed: ${tokRes.status}`);
    const tok = await tokRes.json();
    if (!tok.jwt) throw new Error("no jwt returned from /api/auth/token");
    this.jwt = tok.jwt;
    this.user = tok.user;
    return tok.user;
  }

  // Create an account via the credentials-signup provider. Returns { ok, status }.
  // Does not log in — call login() afterwards.
  async signup({ email, password, name }) {
    const csrfRes = await this.#raw("/api/auth/csrf", {
      headers: { accept: "application/json" },
    });
    if (!csrfRes.ok) throw new Error(`csrf failed: ${csrfRes.status}`);
    const { csrfToken } = await csrfRes.json();
    const body = new URLSearchParams({
      csrfToken,
      email,
      password,
      name: name || "",
      callbackUrl: `${this.baseURL}/api/auth/token`,
      json: "true",
    });
    const res = await this.#raw("/api/auth/callback/credentials-signup", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });
    return { ok: res.status < 400, status: res.status };
  }

  #authHeaders(extra = {}) {
    const h = new Headers(extra);
    if (this.jwt) h.set("authorization", `Bearer ${this.jwt}`);
    return h;
  }

  // Authenticated JSON request. Returns { ok, status, data }.
  async api(method, pathname, jsonBody) {
    const headers = this.#authHeaders({ accept: "application/json" });
    let body;
    if (jsonBody !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(jsonBody);
    }
    const res = await this.#raw(pathname, { method, headers, body });
    let data = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => null);
    }
    return { ok: res.ok, status: res.status, data };
  }

  get(p) {
    return this.api("GET", p);
  }
  post(p, b) {
    return this.api("POST", p, b);
  }
  patch(p, b) {
    return this.api("PATCH", p, b);
  }
  put(p, b) {
    return this.api("PUT", p, b);
  }

  // Multipart image upload. Field name / return key are configured by the
  // caller (filled from the upload route spec). Returns the uploaded URL.
  async uploadImage(absPath, { field = "file", urlKey = "url", endpoint = "/api/upload" } = {}) {
    const buf = await readFile(absPath);
    const name = path.basename(absPath);
    const fd = new FormData();
    fd.set(field, new Blob([buf], { type: "image/jpeg" }), name);
    const headers = this.#authHeaders(); // let fetch set the multipart boundary
    const res = await this.#raw(endpoint, { method: "POST", headers, body: fd });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = await res.text().catch(() => null);
    }
    if (!res.ok) {
      throw new Error(
        `upload failed ${res.status}: ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data)}`,
      );
    }
    const url =
      (data && (data[urlKey] || data.url || data.imageUrl || data.publicUrl)) ||
      null;
    if (!url) throw new Error(`upload returned no url: ${JSON.stringify(data)}`);
    return url;
  }
}

// ---------------------------------------------------------------------------
// Small utilities used by section seeders.
// ---------------------------------------------------------------------------

// ISO helpers relative to "now" so seeded data always looks fresh.
export const now = () => new Date();
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
export function daysAhead(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
export function atHour(date, hour, minute = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}
export const iso = (d) => d.toISOString();
export const dateOnly = (d) => d.toISOString().slice(0, 10);

// Pretty section logging + a run report the main script prints at the end.
export class Report {
  constructor() {
    this.sections = [];
  }
  section(name) {
    const s = { name, created: [], skipped: [], errors: [], notes: [] };
    this.sections.push(s);
    console.log(`\n=== ${name} ===`);
    return {
      created: (what) => {
        s.created.push(what);
        console.log(`  + ${what}`);
      },
      skipped: (what) => {
        s.skipped.push(what);
        console.log(`  = ${what} (already present)`);
      },
      error: (what) => {
        s.errors.push(what);
        console.log(`  ! ${what}`);
      },
      note: (what) => {
        s.notes.push(what);
        console.log(`  · ${what}`);
      },
    };
  }
  print() {
    console.log("\n\n========== SEED REPORT ==========");
    for (const s of this.sections) {
      const status =
        s.errors.length === 0
          ? s.created.length > 0
            ? "OK"
            : "OK (nothing new)"
          : "PARTIAL";
      console.log(
        `\n[${status}] ${s.name} — ${s.created.length} created, ${s.skipped.length} already present, ${s.errors.length} errors`,
      );
      for (const e of s.errors) console.log(`     ! ${e}`);
      for (const n of s.notes) console.log(`     · ${n}`);
    }
    console.log("\n=================================\n");
  }
}

// Add-only top-up: create records for a list endpoint only if it has fewer than
// `target`. `makers` is an array of fns each returning { path, body, idKey }.
export async function topUp(session, r, { label, listUrl, listKey, target, makers }) {
  let existing = 0;
  try {
    const res = await session.get(listUrl);
    const arr = (res.data && res.data[listKey]) || [];
    existing = Array.isArray(arr) ? arr.length : 0;
  } catch {
    /* treat as empty */
  }
  if (existing >= target) {
    r.skipped(`${label} (${existing} already)`);
    return;
  }
  for (const make of makers.slice(0, target - existing)) {
    try {
      const { path, body, idKey } = make();
      const res = await session.post(path, body);
      const created = res.data && (res.data[idKey] || res.data.log);
      if (res.ok && created) r.created(`${label}: ${created.id ?? "ok"}`);
      else r.error(`${label}: ${res.status} ${JSON.stringify(res.data).slice(0, 160)}`);
    } catch (e) {
      r.error(`${label}: ${e.message}`);
    }
  }
}

// Retry a request helper a few times on transient network failure.
export async function withRetry(fn, { tries = 4, label = "op" } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const wait = 2 ** i * 1000;
      console.log(`  … ${label} failed (${e.message}); retry in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
