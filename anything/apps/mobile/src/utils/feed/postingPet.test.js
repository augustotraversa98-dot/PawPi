import { pickPostingPet } from "./postingPet";

const pet = (id, role, shared = role !== "owner") => ({ id, name: `Dog${id}`, is_shared: shared, access_role: role });

describe("pickPostingPet — which dog the Feed's post button posts for", () => {
  test("owner: the active dog", () => {
    const a = pet(1, "owner");
    expect(pickPostingPet(a, [a, pet(2, "caregiver")])).toBe(a);
  });

  test("family on the active dog: the active dog (a family member may post the moment)", () => {
    const a = pet(2, "family");
    expect(pickPostingPet(a, [a, pet(1, "owner")])).toBe(a);
  });

  test("caregiver only: nothing to post for", () => {
    const a = pet(3, "caregiver");
    expect(pickPostingPet(a, [a])).toBeNull();
  });

  test("caregiver who also owns a dog: the OWN dog, whichever order the list comes in", () => {
    const shared = pet(3, "caregiver");
    const own = pet(7, "owner");
    expect(pickPostingPet(shared, [shared, own])).toBe(own);
    expect(pickPostingPet(shared, [own, shared])).toBe(own);
  });

  test("caregiver who is family on ANOTHER shared dog but owns none: not widened, nothing to post for", () => {
    const a = pet(3, "caregiver");
    expect(pickPostingPet(a, [a, pet(4, "family")])).toBeNull();
  });

  test("an unknown role on a shared dog is treated as a caregiver (never an owner by accident)", () => {
    const a = { id: 5, is_shared: true, access_role: "mystery" };
    expect(pickPostingPet(a, [a])).toBeNull();
  });

  test("old server with no roles: every pet is an owned pet, so the active dog posts", () => {
    const a = { id: 1, name: "Rex" };
    expect(pickPostingPet(a, [a])).toBe(a);
  });

  test("no active pet, or an unusable list", () => {
    expect(pickPostingPet(null, [pet(1, "owner")])).toBeNull();
    expect(pickPostingPet(pet(3, "caregiver"), undefined)).toBeNull();
  });
});
