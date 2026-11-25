import { canManageMoment, canDeleteMoment } from "./postPermissions";

const post = (user_id) => ({ id: 1, pet_id: 7, user_id });

test("the author may delete their moment, also on a dog shared with them", () => {
  expect(canManageMoment(post(20), { myProfileId: 20, ownsPet: false })).toBe(true);
  expect(canManageMoment(post("20"), { myProfileId: 20 })).toBe(true);
});

test("a member may not delete someone else's moment on the shared dog", () => {
  expect(canManageMoment(post(10), { myProfileId: 20, ownsPet: false })).toBe(false);
});

test("the owner is not offered a delete the server refuses (a member's moment on their dog)", () => {
  expect(canManageMoment(post(20), { myProfileId: 10, ownsPet: true })).toBe(false);
});

test("unknown author or unknown own id: only the viewer's own dogs", () => {
  expect(canManageMoment(post(undefined), { myProfileId: 20, ownsPet: true })).toBe(true);
  expect(canManageMoment(post(undefined), { myProfileId: 20, ownsPet: false })).toBe(false);
  expect(canManageMoment(post(10), { myProfileId: undefined, ownsPet: false })).toBe(false);
});

test("business posts and nothing are never manageable", () => {
  expect(canManageMoment({ item_type: "provider_post", user_id: 20 }, { myProfileId: 20 })).toBe(false);
  expect(canManageMoment(null, { myProfileId: 20, ownsPet: true })).toBe(false);
});

describe("delete (migration 0145)", () => {
  const moment = { id: 1, pet_id: 7, user_id: 20, is_daily_update: true };

  test("the dog's owner may delete a member's daily moment, but not edit it", () => {
    expect(canDeleteMoment(moment, { myProfileId: 10, ownsPet: true })).toBe(true);
    expect(canManageMoment(moment, { myProfileId: 10, ownsPet: true })).toBe(false);
  });

  test("not another kind of post by someone else", () => {
    expect(canDeleteMoment({ ...moment, is_daily_update: false }, { myProfileId: 10, ownsPet: true })).toBe(false);
  });

  test("a member still deletes only their own", () => {
    expect(canDeleteMoment(moment, { myProfileId: 20, ownsPet: false })).toBe(true);
    expect(canDeleteMoment(moment, { myProfileId: 30, ownsPet: false })).toBe(false);
  });
});
