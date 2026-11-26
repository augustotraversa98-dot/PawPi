import { mailUrl, parseFinderContact, telUrl } from "./finderContact";

test("reads the server's finder contact, as an object or as JSON text", () => {
  const raw = { pet_name: "Busdy", name: " Marta ", phone: "123456", email: "", message: 7 };
  const parsed = { petName: "Busdy", name: "Marta", phone: "123456", email: null, message: null };
  expect(parseFinderContact(raw)).toEqual(parsed);
  expect(parseFinderContact(JSON.stringify(raw))).toEqual(parsed);
});

test.each([null, undefined, "not json", "[1]", 5, ["a"]])("ignores %p", (raw) => {
  expect(parseFinderContact(raw)).toBeNull();
});

test("tel: links keep only digits and a leading +", () => {
  expect(telUrl("+54 (9) 11 5555-0101")).toBe("tel:+5491155550101");
  expect(telUrl("11 5555;wait=1")).toBe("tel:1155551");
  expect(telUrl("abc")).toBeNull();
});

test("mailto: links only for a plain address", () => {
  expect(mailUrl("marta@example.test")).toBe("mailto:marta@example.test");
  for (const bad of ["marta", "a@example.test?subject=x", "a@example.test,b@example.test", "a b@example.test"])
    expect(mailUrl(bad)).toBeNull();
});
