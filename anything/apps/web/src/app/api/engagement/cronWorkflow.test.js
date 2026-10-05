// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards .github/workflows/cron-jobs.yml for notifications v2 (PR 3b): the digest, win-back and receipts jobs
// exist, hit the right endpoints with the shared x-cron-secret (never an inline secret), run only on their own
// schedule, and the two pre-existing jobs are untouched.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
const raw = fs.readFileSync(path.join(REPO, ".github/workflows/cron-jobs.yml"), "utf8");
// Dependency-free parse (no yaml package): schedules from the `on:` block, jobs from the `jobs:` block.
const crons = [...raw.matchAll(/^\s+- cron: '([^']+)'/gm)].map((m) => m[1]);
const jobsSrc = raw.slice(raw.indexOf("\njobs:") + 1);
const heads = [...jobsSrc.matchAll(/^  ([a-z][a-z0-9-]*):[ \t]*$/gm)];
const jobs = {};
heads.forEach((h, i) => {
  const body = jobsSrc.slice(h.index, i + 1 < heads.length ? heads[i + 1].index : undefined);
  jobs[h[1]] = {
    if: /^    if: (.*)$/m.exec(body)?.[1]?.trim() ?? "",
    run: body.slice(body.indexOf("run: |")),
  };
});
const wf = { jobs };
const HOST = "https://pawpi-production.up.railway.app";
describe("cron-jobs.yml", () => {
  it("keeps the two existing jobs exactly (schedules + endpoints + manual trigger)", () => {
    expect(crons).toContain("0 6 * * *");
    expect(crons).toContain("15 6 * * *");
    expect(wf.jobs["subscriptions-run"].if).toBe("github.event.schedule == '0 6 * * *' || github.event_name == 'workflow_dispatch'");
    expect(wf.jobs["calendar-sync"].if).toBe("github.event.schedule == '15 6 * * *' || github.event_name == 'workflow_dispatch'");
    expect(wf.jobs["subscriptions-run"].run).toContain(`${HOST}/api/payments/subscriptions/run`);
    expect(wf.jobs["calendar-sync"].run).toContain(`${HOST}/api/providers/calendar/sync`);
  });

  const CASES = [
    ["weekly-digest", "0 * * * *", "/api/engagement/weekly-digest/run"],
    ["winback", "30 13 * * *", "/api/engagement/reengagement/run"],
    ["push-receipts", "20 * * * *", "/api/notifications/push-receipts/run"],
  ];
  for (const [job, cron, endpoint] of CASES) {
    it(`${job}: scheduled '${cron}', POSTs ${endpoint} with the cron secret, schedule-only`, () => {
      expect(crons).toContain(cron);
      const j = wf.jobs[job];
      expect(j.if).toBe(`github.event.schedule == '${cron}'`); // not workflow_dispatch: a manual test never sends
      const run = j.run;
      expect(run).toContain("-X POST");
      expect(run).toContain(`${HOST}${endpoint}`);
      expect(run).toContain('-H "x-cron-secret: ${{ secrets.CRON_SECRET }}"');
    });
  }

  it("every schedule maps to exactly one job and no other secret / literal credential appears", () => {
    for (const cron of crons) {
      const jobs = Object.entries(wf.jobs).filter(([, j]) => j.if.includes(`'${cron}'`));
      expect(jobs.length, cron).toBe(1);
    }
    const secrets = [...raw.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(["CRON_SECRET"]));
    expect(raw).not.toMatch(/x-cron-secret: [^$"\s]/); // never a literal value
  });
});
