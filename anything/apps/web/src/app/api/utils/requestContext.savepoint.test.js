import { describe, it, expect, vi, beforeEach } from "vitest";

// withSavepoint — transaction scoping for handlers whose RESPONSE SHAPE is a security property.
//
// Unit-level contract only (does this reach for a savepoint, and does it re-throw?). That a
// savepoint genuinely rescues a poisoned transaction is a real-Postgres claim, proven in
// test/integration/password-reset.integration.test.ts.

let activeTx = null;
const runWithTxCalls = [];
vi.mock("@/app/api/utils/sql", () => ({
  default: vi.fn(),
  getActiveTx: () => activeTx,
  runWithTx: (tx, fn) => {
    runWithTxCalls.push(tx);
    return fn();
  },
}));

import { withSavepoint } from "./requestContext";

beforeEach(() => {
  activeTx = null;
  runWithTxCalls.length = 0;
});

describe("withSavepoint — no request transaction open", () => {
  it("runs the callback directly and returns its value", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    await expect(withSavepoint(fn)).resolves.toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-throws — it scopes the transaction, it does not handle errors", async () => {
    await expect(
      withSavepoint(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });
});

describe("withSavepoint — inside a request transaction", () => {
  it("runs the callback through tx.savepoint", async () => {
    const savepoint = vi.fn((cb) => cb({ handle: "sp" }));
    activeTx = { savepoint };

    const fn = vi.fn().mockResolvedValue("result");
    await expect(withSavepoint(fn)).resolves.toBe("result");
    expect(savepoint).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // Load-bearing, not cosmetic: if the async-local handle stays bound to the OUTER transaction,
  // the queries inside are issued on it, ROLLBACK TO SAVEPOINT doesn't recover the connection,
  // and the outer COMMIT still fails — the savepoint would buy nothing. Verified against real
  // Postgres in test/integration/password-reset.integration.test.ts.
  it("REBINDS the async-local handle to the savepoint, not the outer transaction", async () => {
    const sp = { handle: "sp" };
    activeTx = { handle: "outer", savepoint: (cb) => cb(sp) };

    await withSavepoint(() => Promise.resolve("result"));
    expect(runWithTxCalls).toEqual([sp]);
  });

  it("still re-throws a failure from inside the savepoint", async () => {
    activeTx = { savepoint: (cb) => cb() };
    await expect(
      withSavepoint(() => Promise.reject(new Error("query failed"))),
    ).rejects.toThrow("query failed");
  });

  // Defensive: a transaction handle without `savepoint` (an older client, or a test double)
  // must degrade to running the callback, not crash the request.
  it("falls back to a direct call when the tx exposes no savepoint()", async () => {
    activeTx = {};
    const fn = vi.fn().mockResolvedValue("result");
    await expect(withSavepoint(fn)).resolves.toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
