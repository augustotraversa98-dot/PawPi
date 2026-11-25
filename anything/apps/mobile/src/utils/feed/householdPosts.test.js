import { householdPetIdSet, isHouseholdPost } from "./householdPosts";

describe("householdPetIdSet", () => {
  it("holds every dog of the list (owned and shared with the person) as strings", () => {
    const set = householdPetIdSet([
      { id: 1, is_shared: false, access_role: "owner" },
      { id: "2", is_shared: true, access_role: "family" },
      { id: 3, is_shared: true, access_role: "caregiver" },
    ]);
    expect([...set].sort()).toEqual(["1", "2", "3"]);
  });
  it("is empty when the list is unknown", () => {
    expect(householdPetIdSet(undefined).size).toBe(0);
    expect(householdPetIdSet(null).size).toBe(0);
    expect(householdPetIdSet([{ name: "no id" }]).size).toBe(0);
  });
});

describe("isHouseholdPost", () => {
  const ids = new Set(["1", "2"]);
  it("true for a moment of a household dog, number or string id", () => {
    expect(isHouseholdPost({ pet_id: 1 }, ids)).toBe(true);
    expect(isHouseholdPost({ pet_id: "2" }, ids)).toBe(true);
  });
  it("false for someone else's dog, a business post, a post with no dog, or an unknown household", () => {
    expect(isHouseholdPost({ pet_id: 9 }, ids)).toBe(false);
    expect(isHouseholdPost({ pet_id: 1, item_type: "provider_post" }, ids)).toBe(false);
    expect(isHouseholdPost({ id: 5 }, ids)).toBe(false);
    expect(isHouseholdPost({ pet_id: 1 }, null)).toBe(false);
    expect(isHouseholdPost(null, ids)).toBe(false);
  });
});
