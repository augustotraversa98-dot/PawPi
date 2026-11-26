// Migration 0151: the per-sender counters for opening a public tag / vet-card page age out after 90 days, like the finder-message
// counters, through the REAL hourly cron route and the real public routes, as pawpi_app on the throwaway Postgres.
// supabase/verify_0151.sql must read PASS.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { MIGRATIONS_DIR, makeTestSql, resetDb } from "./db";

vi.mock("@/auth", () => ({ auth: async () => null }));

let raw: Sql;
let app: Sql;
let api: any;

const migration = () => readFile(path.join(MIGRATIONS_DIR, "0151_purge_tag_open_counters.sql"), "utf8");
const cron = () => api.request("/notifications/push-receipts/run", { method: "POST", headers: { "x-cron-secret": "test-secret" } });
const buckets = async () => (await raw`select bucket, subject from rate_limit_hits order by bucket, subject`).map((r: any) => `${r.bucket}|${r.subject}`);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  app = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ""), username: "pawpi_app", password: "pawpi_app", max: 1, onnotice: () => {} });
  ({ api } = (await import("../../__create/route-builder")) as any);
  // Other files re-apply 0146 on the shared cluster (to prove it is idempotent), which restores the older purge function. 0151 is
  // idempotent too, so assert its final state before this file's tests run.
  await raw.unsafe(await migration());
});
afterAll(async () => { await app.end(); await raw.end(); });
beforeEach(() => { process.env.CRON_SECRET = "test-secret"; });
afterEach(async () => { await resetDb(raw); delete process.env.CRON_SECRET; });

describe("0151 — tag-open counters are removed after 90 days", () => {
  it("opening a public tag page leaves a counter, and the hourly job removes it once it is older than 90 days", async () => {
    const open = await api.request("/public/emergency/tag/NOSUCHTAG", { headers: { "x-real-ip": "10.2.0.1" } });
    expect([200, 404]).toContain(open.status);
    const rows = await raw`select bucket, subject, window_start from rate_limit_hits where bucket = 'emergency_public_read'`;
    expect(rows.length).toBe(1); // a real row written by the real route, keyed on a hash (not the address)
    expect(rows[0].subject).not.toContain("10.2.0.1");

    expect((await cron()).status).toBe(200);
    expect(await buckets()).toHaveLength(1); // young: kept

    await raw`update rate_limit_hits set window_start = now() - interval '91 days' where bucket = 'emergency_public_read'`;
    expect((await cron()).status).toBe(200);
    expect(await buckets()).toEqual([]);
  });

  it("removes old tag-open counters from the vet-card page bucket too, keeps young ones, and leaves other buckets alone", async () => {
    await raw`insert into rate_limit_hits (bucket, subject, window_start, hits) values
      ('emergency_public_read', 'ip:old', now() - interval '91 days', 1),
      ('emergency_public_read', 'ip:young', now() - interval '89 days', 1),
      ('emergency_relay', 'ip:old', now() - interval '91 days', 1),
      ('emergency_relay_daily', 'ip:old', now() - interval '91 days', 1),
      ('emergency_relay_urgent', 'ip:old', now() - interval '91 days', 1),
      ('emergency_relay_daily', 'ip:new', now() - interval '1 day', 1),
      ('post_create', 'u:1', now() - interval '91 days', 1),
      ('vet_invite_open', 'ip:old', now() - interval '91 days', 1)`;
    await app.begin(async (tx) => tx`select app_purge_finder_details()`);
    expect(await buckets()).toEqual([
      "emergency_public_read|ip:young",
      "emergency_relay_daily|ip:new",
      "post_create|u:1",
      "vet_invite_open|ip:old",
    ]);
  });

  it("the job still clears finder details on notifications and reports the count", async () => {
    const res = await cron();
    expect(res.status).toBe(200);
    expect((await res.json()).finderDetailsCleared).toBe(0);
  });
});

describe("verify_0151.sql and idempotence", () => {
  it("every row reads PASS on the migrated database", async () => {
    const rows = await raw.unsafe(await readFile(path.resolve(MIGRATIONS_DIR, "../verify_0151.sql"), "utf8"));
    expect(rows.length).toBe(5);
    for (const r of rows as any[]) expect(r.status, `${r.check_name} :: ${r.detail}`).toBe("PASS");
  });

  it("row 5 reads FAIL while an overdue counter exists, and PASS after the purge", async () => {
    const sqlText = await readFile(path.resolve(MIGRATIONS_DIR, "../verify_0151.sql"), "utf8");
    await raw`insert into rate_limit_hits (bucket, subject, window_start, hits) values ('emergency_public_read', 'ip:old', now() - interval '91 days', 1)`;
    expect(((await raw.unsafe(sqlText)) as any[])[4].status).toBe("FAIL");
    await app.begin(async (tx) => tx`select app_purge_finder_details()`);
    expect(((await raw.unsafe(sqlText)) as any[])[4].status).toBe("PASS");
  });

  it("re-applying the migration leaves exactly one function", async () => {
    await raw.unsafe(await migration());
    await raw.unsafe(await migration());
    expect((await raw`select count(*)::int n from pg_proc where proname = 'app_purge_finder_details'`)[0].n).toBe(1);
  });
});
