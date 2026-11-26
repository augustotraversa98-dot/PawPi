import { goBackOr } from "./navigationBack";

const router = (canGoBack) => ({ back: jest.fn(), replace: jest.fn(), canGoBack });

test("goes back when there is history", () => {
  const r = router(() => true);
  goBackOr(r, "/(tabs)/more");
  expect(r.back).toHaveBeenCalled();
  expect(r.replace).not.toHaveBeenCalled();
});

test("replaces with the fallback when there is no history", () => {
  const r = router(() => false);
  goBackOr(r, "/(tabs)/more");
  expect(r.replace).toHaveBeenCalledWith("/(tabs)/more");
  expect(r.back).not.toHaveBeenCalled();
});

test("goes back when the router cannot say", () => {
  const r = { back: jest.fn(), replace: jest.fn() };
  goBackOr(r, "/(tabs)/more");
  expect(r.back).toHaveBeenCalled();
});
