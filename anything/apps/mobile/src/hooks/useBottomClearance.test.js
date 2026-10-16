import { computeBottomClearance, IOS_TAB_BAR_HEIGHT } from "./useBottomClearance";

describe("computeBottomClearance", () => {
  it("adds the native tab bar height on iOS tab screens", () => {
    expect(
      computeBottomClearance({ platform: "ios", inTabs: true, insetBottom: 34 }),
    ).toBe(34 + IOS_TAB_BAR_HEIGHT);
  });

  it("is just the safe-area inset on iOS screens outside the tab bar", () => {
    expect(
      computeBottomClearance({ platform: "ios", inTabs: false, insetBottom: 34 }),
    ).toBe(34);
  });

  it("is just the safe-area inset on Android (in-flow JS tab bar)", () => {
    expect(
      computeBottomClearance({ platform: "android", inTabs: true, insetBottom: 12 }),
    ).toBe(12);
  });

  it("tolerates a missing inset", () => {
    expect(
      computeBottomClearance({ platform: "ios", inTabs: true, insetBottom: undefined }),
    ).toBe(IOS_TAB_BAR_HEIGHT);
  });
});
