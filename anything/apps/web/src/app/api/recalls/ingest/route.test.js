import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/recalls/ingest — machine-to-machine recall ingest (ticket 2.75). Secret-gated; idempotent
// upsert via ingest_food_recall + match_food_recall; degrade-clean (503) when CRON_SECRET is unset.

import { POST } from "./route";
import sql from "@/app/api/utils/sql";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const ORIGINAL = process.env.CRON_SECRET;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

const req = (body, headers = {}) =>
  new Request("http://localhost/api/recalls/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/recalls/ingest", () => {
  it("CRON_SECRET unset → 503 (degrade clean, disabled)", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(req({ recalls: [] }))).status).toBe(503);
  });

  it("wrong secret header → 401", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect((await POST(req({ recalls: [] }, { "x-cron-secret": "nope" }))).status).toBe(401);
  });

  it("ingests + matches each recall idempotently → 200", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    // per recall: ingest_food_recall → id, then match_food_recall → n
    sql
      .mockResolvedValueOnce([{ id: 11 }]) // ingest
      .mockResolvedValueOnce([{ n: 2 }]); // match
    const body = {
      recalls: [
        { source: "FDA", external_ref: "R-1", brand: "Acme", product: "Chicken", reason: "salmonella" },
      ],
    };
    const res = await POST(req(body, { "x-cron-secret": "s3cr3t" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ingested: 1, matched: 2 });
    expect(sql.mock.calls[0][0].join(" ")).toContain("ingest_food_recall");
    expect(sql.mock.calls[1][0].join(" ")).toContain("match_food_recall");
  });

  it("skips items without source/external_ref", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await POST(req({ recalls: [{ brand: "NoKey" }] }, { "x-cron-secret": "s3cr3t" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ingested: 0, matched: 0 });
    expect(sql).not.toHaveBeenCalled();
  });
});
