import {
  computeActivation,
  isHistoryComplete,
  hasBasics,
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

describe("hasBasics", () => {
  test("true only with a name AND a breed", () => {
    expect(hasBasics({ name: "Mango", breed: "Beagle" })).toBe(true);
    expect(hasBasics({ name: "Mango" })).toBe(false);
    expect(hasBasics({ breed: "Beagle" })).toBe(false);
    expect(hasBasics({ name: "  ", breed: "Beagle" })).toBe(false);
    expect(hasBasics(null)).toBe(false);
  });
});

describe("isHistoryComplete", () => {
  test("needs breed + an age + a real gender + a weight", () => {
    expect(isHistoryComplete(fullPet)).toBe(true);
  });
  test("age satisfied by birthday OR age_years", () => {
    expect(isHistoryComplete({ ...fullPet, birthday: null, age_years: 2 })).toBe(true);
    expect(isHistoryComplete({ ...fullPet, birthday: "2022-01-01", age_years: null })).toBe(true);
    expect(isHistoryComplete({ ...fullPet, birthday: null, age_years: null })).toBe(false);
  });
  test("gender 'unknown' does not count", () => {
    expect(isHistoryComplete({ ...fullPet, gender: "unknown" })).toBe(false);
  });
  test("missing weight fails", () => {
    expect(isHistoryComplete({ ...fullPet, weight: null })).toBe(false);
    expect(isHistoryComplete({ ...fullPet, weight: "" })).toBe(false);
  });
  test("null pet is not complete", () => {
    expect(isHistoryComplete(null)).toBe(false);
  });
});

describe("computeActivation", () => {
  test("all-undone (no pet, nothing derived) → 0%", () => {
    const a = computeActivation({});
    expect(a.total).toBe(6);
    expect(a.completed).toBe(0);
    expect(a.percent).toBe(0);
    expect(a.isComplete).toBe(false);
    expect(a.items.map((i) => i.key)).toEqual(ACTIVATION_ITEMS);
    expect(a.items.every((i) => i.done === false)).toBe(true);
  });

  test("each item derives from its own signal", () => {
    const a = computeActivation({
      pet: fullPet, // basics + history done
      hasReminder: true,
      hasMeal: false,
      hasPost: false,
      notificationsGranted: false,
    });
    const done = Object.fromEntries(a.items.map((i) => [i.key, i.done]));
    expect(done).toEqual({
      basics: true,
      history: true,
      reminder: true,
      meal: false,
      post: false,
      notifications: false,
    });
  });

  test("% math is completed ÷ total, rounded", () => {
    // basics only (name+breed), nothing else → 1/6 → 17%.
    const a = computeActivation({ pet: { name: "Mango", breed: "Beagle" } });
    expect(a.completed).toBe(1);
    expect(a.percent).toBe(17);
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
    expect(a.completed).toBe(6);
    expect(a.percent).toBe(100);
    expect(a.isComplete).toBe(true);
  });
});
