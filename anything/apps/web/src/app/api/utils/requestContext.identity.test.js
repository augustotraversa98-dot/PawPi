import { describe, it, expect, vi, beforeEach } from "vitest";

// Round-trip budget of the request identity plumbing.
//
// Production latency is dominated by SEQUENTIAL statements (Railway us-east4 -> Supabase sa-east-1, so each
// one is a cross-continent round trip). A trivial route used to pay: BEGIN + profile lookup + set_config
// (applyIdentity) + the same lookup + set_config again (resolveOrCreateUserId) + the real query + COMMIT.
// This pins the budget: ONE statement resolves+stamps the caller, and the handler-side helpers add none.
// That the combined statement is valid and RLS-correct is proven against real Postgres in
// test/integration/request-identity.integration.test.ts.

const state = vi.hoisted(() => ({
  session: null,
  profileRows: [],
  statements: [],
}));

vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("@/app/api/utils/sql", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const als = new AsyncLocalStorage();
  const makeTx = () => {
    const tx = (strings) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      state.statements.push(text);
      return Promise.resolve(/from user_profiles/i.test(text) ? state.profileRows : []);
    };
    return tx;
  };
  const sql = (...args) => (als.getStore()?.tx ?? makeTx())(...args);
  sql.begin = (fn) => fn(makeTx());
  return {
    default: sql,
    getActiveTx: () => als.getStore()?.tx ?? null,
    runWithTx: (tx, fn) => als.run({ tx }, fn),
  };
});

import { withRequestContext } from "./requestContext";
import { resolveUserId, resolveOrCreateUserId } from "./currentUser";

const request = new Request("http://localhost/api/anything");

beforeEach(() => {
  state.session = { user: { id: "42", email: "a@example.com", name: "A" } };
  state.profileRows = [{ id: 7 }];
  state.statements.length = 0;
});

describe("withRequestContext identity round trips", () => {
  it("resolves AND stamps the caller in exactly one statement", async () => {
    await withRequestContext(async () => Response.json({}))(request);
    expect(state.statements).toHaveLength(1);
    expect(state.statements[0]).toMatch(/from user_profiles/i);
    expect(state.statements[0]).toMatch(/set_config\('app\.current_user_id', id::text, true\)/);
    expect(state.statements[0]).toMatch(/where auth_user_id = \?/i);
  });

  it("resolveUserId inside the request reuses the result: zero extra statements", async () => {
    let seen;
    await withRequestContext(async () => {
      seen = await resolveUserId("42");
      return Response.json({});
    })(request);
    expect(seen).toBe(7);
    expect(state.statements).toHaveLength(1);
  });

  it("resolveOrCreateUserId inside the request reuses it too (no lookup, no second set_config)", async () => {
    let seen;
    await withRequestContext(async () => {
      seen = await resolveOrCreateUserId(state.session);
      return Response.json({});
    })(request);
    expect(seen).toBe(7);
    expect(state.statements).toHaveLength(1);
  });

  it("a DIFFERENT auth id is still looked up for real", async () => {
    state.profileRows = [{ id: 7 }];
    await withRequestContext(async () => {
      await resolveUserId("999");
      return Response.json({});
    })(request);
    expect(state.statements).toHaveLength(2);
    expect(state.statements[1]).toMatch(/from user_profiles/i);
  });

  it("caller with no profile yet: nothing is memoised, so the lookup still runs and still gets null", async () => {
    state.profileRows = [];
    let seen = "unset";
    await withRequestContext(async () => {
      seen = await resolveUserId("42");
      return Response.json({});
    })(request);
    expect(seen).toBeNull();
    expect(state.statements).toHaveLength(2); // identity attempt + the handler's real lookup
  });

  it("unauthenticated or ghost sessions issue no identity statement at all", async () => {
    state.session = null;
    await withRequestContext(async () => Response.json({}))(request);
    state.session = { user: { id: "3f2b8c1e-aaaa-bbbb-cccc-000000000000" } };
    await withRequestContext(async () => Response.json({}))(request);
    expect(state.statements).toHaveLength(0);
  });

  it("outside a request scope resolveUserId always queries (cron / background / mocked callers)", async () => {
    state.profileRows = [{ id: 7 }];
    expect(await resolveUserId("42")).toBe(7);
    expect(state.statements).toHaveLength(1);
  });
});
