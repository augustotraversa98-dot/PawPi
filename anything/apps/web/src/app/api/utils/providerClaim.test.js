import { describe, it, expect, vi, beforeEach } from "vitest";
import sql from "./sql";
import { isUnclaimedProvider, providerIsUnclaimed, unclaimedProviderResponse } from "./providerClaim";

vi.mock("./sql", () => ({ default: vi.fn() }));

const request = (language) =>
  new Request("http://localhost/api/x", language ? { headers: { "accept-language": language } } : undefined);

beforeEach(() => vi.clearAllMocks());

describe("isUnclaimedProvider", () => {
  it("is true for every claim_status other than claimed", () => {
    expect(isUnclaimedProvider({ claim_status: "unclaimed" })).toBe(true);
    expect(isUnclaimedProvider({ claim_status: "pending" })).toBe(true);
    expect(isUnclaimedProvider({ claim_status: "claimed" })).toBe(false);
  });

  it("does not judge a missing row or a row without the column", () => {
    expect(isUnclaimedProvider(undefined)).toBe(false);
    expect(isUnclaimedProvider({})).toBe(false);
    expect(isUnclaimedProvider({ claim_status: null })).toBe(false);
  });
});

describe("providerIsUnclaimed", () => {
  it("reads the listing's claim_status", async () => {
    sql.mockResolvedValueOnce([{ claim_status: "unclaimed" }]);
    expect(await providerIsUnclaimed(8)).toBe(true);
  });

  it("leaves an unknown or malformed id to the route, without a query for the latter", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await providerIsUnclaimed(999)).toBe(false);
    expect(await providerIsUnclaimed("abc")).toBe(false);
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe("unclaimedProviderResponse", () => {
  it.each([
    ["booking", "booking", "reserva"],
    ["order", "order", "pedido"],
    ["message", "message", "mensaje"],
    ["request", "request", "solicitud"],
  ])("answers 409 in the caller's language (%s)", async (kind, en, es) => {
    const english = await unclaimedProviderResponse(request("en-US"), kind).json();
    expect(english.error).toBe(`This business hasn't been claimed yet, so we can't send your ${en}.`);
    const spanish = unclaimedProviderResponse(request("es-AR"), kind);
    expect(spanish.status).toBe(409);
    const body = await spanish.json();
    expect(body.code).toBe("provider_unclaimed");
    expect(body.error).toContain(es);
    expect(body.message_en).toBe(english.error);
    expect(body.message_es).toBe(body.error);
  });
});
