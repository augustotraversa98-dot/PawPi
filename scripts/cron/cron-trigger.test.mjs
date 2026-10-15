// Run: node --test scripts/cron/cron-trigger.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runJob } from "./cron-trigger.mjs";

const SECRET = "test-secret-do-not-leak";
let server, base, hits, mode;

before(async () => {
  server = http.createServer((req, res) => {
    hits.push({ url: req.url, method: req.method, secret: req.headers["x-cron-secret"] });
    if (mode === "hang") return; // never answers -> client timeout
    if (mode === "redirect") { res.writeHead(301, { location: "https://elsewhere.example/" }); return res.end(); }
    const status = typeof mode === "number" ? mode : mode.shift?.() ?? 200;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ body: "sensitive-response-body" }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections?.(); server.close(); });

const run = async (job, env = {}) => {
  const lines = [];
  const code = await runJob(job, { CRON_SECRET: SECRET, CRON_BASE_URL: base, ...env }, { log: (l) => lines.push(l), wait: async () => {} });
  return { code, out: lines.join("\n") };
};
const reset = (m) => { hits = []; mode = m; };

test("2xx -> exit 0, POSTs the right path with the secret header", async () => {
  reset(200);
  const { code } = await run("weekly-digest");
  assert.equal(code, 0);
  assert.deepEqual(hits, [{ url: "/api/engagement/weekly-digest/run", method: "POST", secret: SECRET }]);
});

test("every job maps to its endpoint", async () => {
  const want = {
    "weekly-digest": "/api/engagement/weekly-digest/run",
    winback: "/api/engagement/reengagement/run",
    "push-receipts": "/api/notifications/push-receipts/run",
    subscriptions: "/api/payments/subscriptions/run",
    "calendar-sync": "/api/providers/calendar/sync",
  };
  for (const [job, path] of Object.entries(want)) {
    reset(200);
    assert.equal((await run(job)).code, 0);
    assert.equal(hits[0].url, path);
  }
});

test("4xx -> exit 1, no retry", async () => {
  reset(401);
  assert.equal((await run("winback")).code, 1);
  assert.equal(hits.length, 1);
});

test("5xx is retried then fails; recovers if a retry succeeds", async () => {
  reset(500);
  assert.equal((await run("winback")).code, 1);
  assert.equal(hits.length, 3);
  reset([503, 200]);
  assert.equal((await run("winback")).code, 0);
  assert.equal(hits.length, 2);
});

test("timeout -> exit 1, NOT retried (avoids overlapping a still-running job)", async () => {
  reset("hang");
  assert.equal((await run("subscriptions", { CRON_TIMEOUT_MS: "150" })).code, 1);
  assert.equal(hits.length, 1);
});

test("redirect is not followed (secret never forwarded) and fails", async () => {
  reset("redirect");
  assert.equal((await run("calendar-sync")).code, 1);
  assert.equal(hits.length, 1);
});

test("connection refused -> exit 1 after retries", async () => {
  reset(200);
  assert.equal((await run("push-receipts", { CRON_BASE_URL: "http://127.0.0.1:1" })).code, 1);
});

test("config errors: unknown job, missing secret/url, plain http to a public host", async () => {
  reset(200);
  assert.equal((await run("nope")).code, 1);
  assert.equal((await run("winback", { CRON_SECRET: "" })).code, 1);
  assert.equal((await run("winback", { CRON_BASE_URL: "" })).code, 1);
  assert.equal((await run("winback", { CRON_BASE_URL: "http://example.com" })).code, 1);
  assert.equal(hits.length, 0);
});

test("output never contains the secret, URL or response body", async () => {
  for (const m of [200, 500, 401, "hang", "redirect"]) {
    reset(m);
    const { out } = await run("weekly-digest", { CRON_TIMEOUT_MS: "100", CRON_RETRIES: "1" });
    assert.ok(!out.includes(SECRET), out);
    assert.ok(!out.includes(base), out);
    assert.ok(!out.includes("sensitive-response-body"), out);
    assert.match(out, /job=weekly-digest/);
  }
});
