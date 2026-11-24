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

test("the server's English 'Former member' (content left by someone who deleted their account) is shown translated", () => {
  const tt = (key) => ({ "common.petParent": "Pet parent", "sharedDog.formerMember": "Ex integrante" })[key] ?? key;
  expect(ownerDisplayName("Former member", tt)).toBe("Ex integrante");
  expect(ownerDisplayName("  former member ", tt)).toBe("Ex integrante");
  expect(ownerDisplayName("Former Member Rodriguez", tt)).toBe("Former Member Rodriguez"); // only the exact placeholder
});
