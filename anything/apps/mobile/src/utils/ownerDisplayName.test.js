import { ownerDisplayName } from "./ownerDisplayName";

const t = (key) => (key === "common.petParent" ? "Pet parent" : key);

test("shows the real display name", () => {
  expect(ownerDisplayName("  Jane Doe ", t)).toBe("Jane Doe");
});

test("falls back to the neutral label — never anything username/e-mail like", () => {
  expect(ownerDisplayName(null, t)).toBe("Pet parent");
  expect(ownerDisplayName("", t)).toBe("Pet parent");
  expect(ownerDisplayName("   ", t)).toBe("Pet parent");
  expect(ownerDisplayName(undefined, t)).toBe("Pet parent");
});
