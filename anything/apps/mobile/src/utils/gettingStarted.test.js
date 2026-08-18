import {
  computeActivation,
  isProfileComplete,
  ACTIVATION_ITEMS,
} from "./gettingStarted";

const fullPet = {
  name: "Mango",
  breed: "Beagle",
  gender: "male",
  weight: 12,
  birthday: "2022-01-01",
  age_years: 3,
};

describe("isProfileComplete", () => {
  test("needs name + breed + an age + a real gender + a weight", () => {
    expect(isProfileComplete(fullPet)).toBe(true);
  });
  test("missing name fails", () => {
    expect(isProfileComplete({ ...fullPet, name: null })).toBe(false);
    expect(isProfileComplete({ ...fullPet, name: "  " })).toBe(false);
  });
  test("missing breed fails", () => {
    expect(isProfileComplete({ ...fullPet, breed: null })).toBe(false);
    expect(isProfileComplete({ ...fullPet, breed: "  " })).toBe(false);
  });
  test("age satisfied by birthday OR age_years", () => {
    expect(isProfileComplete({ ...fullPet, birthday: null, age_years: 2 })).toBe(true);
    expect(isProfileComplete({ ...fullPet, birthday: "2022-01-01", age_years: null })).toBe(true);
    expect(isProfileComplete({ ...fullPet, birthday: null, age_years: null })).toBe(false);
  });
  test("gender 'unknown' does not count", () => {
    expect(isProfileComplete({ ...fullPet, gender: "unknown" })).toBe(false);
  });
  test("missing weight fails", () => {
    expect(isProfileComplete({ ...fullPet, weight: null })).toBe(false);
    expect(isProfileComplete({ ...fullPet, weight: "" })).toBe(false);
  });
  test("null pet is not complete", () => {
    expect(isProfileComplete(null)).toBe(false);
  });
});

describe("computeActivation", () => {
  test("all-undone (no pet, nothing derived) → 0%", () => {
    const a = computeActivation({});
    expect(a.total).toBe(5);
    expect(a.completed).toBe(0);
    expect(a.percent).toBe(0);
    expect(a.isComplete).toBe(false);
    expect(a.items.map((i) => i.key)).toEqual(ACTIVATION_ITEMS);
    expect(a.items.every((i) => i.done === false)).toBe(true);
  });

  test("each item derives from its own signal", () => {
    const a = computeActivation({
      pet: fullPet, // profile done
      hasReminder: true,
      hasMeal: false,
      hasPost: false,
      notificationsGranted: false,
    });
    const done = Object.fromEntries(a.items.map((i) => [i.key, i.done]));
    expect(done).toEqual({
      profile: true,
      reminder: true,
      meal: false,
      post: false,
      notifications: false,
    });
  });

  test("profile item needs the full union — name+breed alone is not enough", () => {
    const a = computeActivation({ pet: { name: "Mango", breed: "Beagle" } });
    expect(a.items.find((i) => i.key === "profile").done).toBe(false);
    expect(a.completed).toBe(0);
    expect(a.percent).toBe(0);
  });

  test("% math is completed ÷ total, rounded", () => {
    // profile only (full bio), nothing else → 1/5 → 20%.
    const a = computeActivation({ pet: fullPet });
    expect(a.completed).toBe(1);
    expect(a.percent).toBe(20);
  });

  test("the notifications item reflects the permission flag", () => {
    expect(
      computeActivation({ notificationsGranted: true }).items.find((i) => i.key === "notifications")
        .done,
    ).toBe(true);
    expect(
      computeActivation({ notificationsGranted: false }).items.find((i) => i.key === "notifications")
        .done,
    ).toBe(false);
  });

  test("everything done → 100% + isComplete", () => {
    const a = computeActivation({
      pet: fullPet,
      hasReminder: true,
      hasMeal: true,
      hasPost: true,
      notificationsGranted: true,
    });
    expect(a.completed).toBe(5);
    expect(a.percent).toBe(100);
    expect(a.isComplete).toBe(true);
  });
});
