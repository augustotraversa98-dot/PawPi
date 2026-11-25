import { isMemberOfSharedDog, ownedDogs, hasActiveMember, accountDeletionRequest, joinNames } from "./deleteAccountContext";

describe("isMemberOfSharedDog", () => {
  it("true only with a shared dog (family or caregiver)", () => {
    expect(isMemberOfSharedDog([{ is_shared: true, access_role: "family" }])).toBe(true);
    expect(isMemberOfSharedDog([{ is_shared: true, access_role: "caregiver" }])).toBe(true);
  });
  it("false for own dogs, empty, missing flags or a non-list (cannot tell → no switch)", () => {
    expect(isMemberOfSharedDog([{ is_shared: false, access_role: "owner" }])).toBe(false);
    expect(isMemberOfSharedDog([])).toBe(false);
    expect(isMemberOfSharedDog([{ id: 1 }])).toBe(false);
    expect(isMemberOfSharedDog(undefined)).toBe(false);
    expect(isMemberOfSharedDog({ pets: [] })).toBe(false);
  });
});

describe("ownedDogs", () => {
  it("keeps only dogs flagged as owned", () => {
    const pets = [{ id: 1, is_shared: false, access_role: "owner" }, { id: 2, is_shared: true, access_role: "family" }, { id: 3 }];
    expect(ownedDogs(pets).map((p) => p.id)).toEqual([1]);
  });
});

describe("hasActiveMember", () => {
  it("only an active, unexpired grant counts", () => {
    expect(hasActiveMember([{ status: "active" }])).toBe(true);
    expect(hasActiveMember([{ status: "pending" }, { status: "revoked" }, { status: "left" }, { status: "active", is_expired: true }])).toBe(false);
    expect(hasActiveMember(undefined)).toBe(false);
  });
});

describe("accountDeletionRequest", () => {
  it("off is the pre-existing request; on adds delete_contributions=1", () => {
    expect(accountDeletionRequest(false)).toEqual({ url: "/api/account", init: { method: "DELETE" } });
    expect(accountDeletionRequest(true)).toEqual({ url: "/api/account?delete_contributions=1", init: { method: "DELETE" } });
  });
});

describe("joinNames", () => {
  it("joins with the given 'and' word", () => {
    expect(joinNames(["Rex"], "and")).toBe("Rex");
    expect(joinNames(["Rex", "Luna"], "and")).toBe("Rex and Luna");
    expect(joinNames(["Rex", "Luna", "Mia"], "y")).toBe("Rex, Luna y Mia");
    expect(joinNames([], "and")).toBe("");
  });
});
