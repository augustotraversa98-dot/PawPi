// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards the scheduled-jobs move to Railway cron (docs/ops/railway-cron.md): .github/workflows/cron-jobs.yml is a
// MANUAL fallback only (no schedule trigger, so it can never double-fire with Railway), it can run each of the five
// jobs, hits the same endpoints as scripts/cron/cron-trigger.mjs, and the shared secret only ever comes from
// secrets.CRON_SECRET. The runbook must list every job's cron expression.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const raw = read(".github/workflows/cron-jobs.yml");
const script = read("scripts/cron/cron-trigger.mjs");
const doc = read("docs/ops/railway-cron.md");

const JOBS = {
  "weekly-digest": { cron: "0 * * * *", endpoint: "/api/engagement/weekly-digest/run" },
  winback: { cron: "30 13 * * *", endpoint: "/api/engagement/reengagement/run" },
  "push-receipts": { cron: "20 * * * *", endpoint: "/api/notifications/push-receipts/run" },
  subscriptions: { cron: "0 6 * * *", endpoint: "/api/payments/subscriptions/run" },
  "calendar-sync": { cron: "15 6 * * *", endpoint: "/api/providers/calendar/sync" },
};
const HOST = "https://pawpi-production.up.railway.app";

describe("cron-jobs.yml (manual fallback)", () => {
  it("has no schedule trigger and offers workflow_dispatch with a job selector", () => {
    expect(raw).not.toMatch(/^\s*schedule:/m);
    expect(raw).not.toMatch(/^\s+- cron:/m);
    expect(raw).toMatch(/^on:\s*\n\s+workflow_dispatch:/m);
    const options = [...raw.matchAll(/^\s+- ([a-z-]+)\s*$/gm)].map((m) => m[1]);
    expect(new Set(options)).toEqual(new Set(Object.keys(JOBS)));
  });

  for (const [job, { endpoint }] of Object.entries(JOBS)) {
    it(`${job}: workflow POSTs ${endpoint}; the trigger script targets the same path`, () => {
      expect(raw).toMatch(new RegExp(`${job}\\)\\s+path=${endpoint} ;;`));
      expect(script).toContain(`"${endpoint}"`);
    });
  }

  it("POSTs to the production host with the secret from env, never a literal, and uses no other secret", () => {
    expect(raw).toContain(`-X POST "${HOST}\${path}"`);
    expect(raw).toContain('-H "x-cron-secret: ${CRON_SECRET}"');
    expect(raw).toContain("CRON_SECRET: ${{ secrets.CRON_SECRET }}");
    const secrets = [...raw.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(["CRON_SECRET"]));
    expect(raw).not.toMatch(/x-cron-secret: [^$"\s]/);
  });

  it("the Railway runbook lists every job with its original UTC cron expression and start command", () => {
    for (const [job, { cron }] of Object.entries(JOBS)) {
      expect(doc, job).toContain(`| \`${cron}\``);
      expect(doc, job).toContain(`node cron-trigger.mjs ${job}`);
    }
  });
});
