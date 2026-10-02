import { isUsableToken, startOver } from "./recovery";

describe("isUsableToken", () => {
  it("accepts a real-shaped JWE/JWT", () => {
    expect(isUsableToken("eyJhbGciOiJkaXIifQ..AbC-_123.xyz_-9.tag-_")).toBe(true);
  });
  it.each([null, undefined, "", 42, "has space.x", "bad\nline", "a+b/c=="])(
    "rejects %p",
    (v) => expect(isUsableToken(v)).toBe(false),
  );
});

describe("startOver", () => {
  it("clears auth and replaces to /welcome", () => {
    const setAuth = jest.fn();
    const router = { replace: jest.fn() };
    startOver({ setAuth, router });
    expect(setAuth).toHaveBeenCalledWith(null);
    expect(router.replace).toHaveBeenCalledWith("/welcome");
  });
  it("still navigates if setAuth throws", () => {
    const router = { replace: jest.fn() };
    startOver({ setAuth: () => { throw new Error("keychain"); }, router });
    expect(router.replace).toHaveBeenCalledWith("/welcome");
  });
});
