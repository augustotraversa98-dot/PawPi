import { findSamePet } from "./findSamePet";

const pets = [
  { id: 1, name: "Mango", is_shared: false },
  { id: 2, name: " Luna ", is_shared: true },
];

test("finds a dog by name ignoring case and spaces, own or shared", () => {
  expect(findSamePet(pets, "mango")?.id).toBe(1);
  expect(findSamePet(pets, "  MANGO ")?.id).toBe(1);
  expect(findSamePet(pets, "luna")?.id).toBe(2); // a dog SHARED with the person counts
});

test("no match, blank name or no list → null", () => {
  expect(findSamePet(pets, "Rex")).toBeNull();
  expect(findSamePet(pets, "  ")).toBeNull();
  expect(findSamePet(undefined, "Mango")).toBeNull();
  expect(findSamePet([], "Mango")).toBeNull();
});
