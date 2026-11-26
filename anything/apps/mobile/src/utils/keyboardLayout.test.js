import {
  computeKeyboardOverlap,
  computeSheetHeight,
  computeFooterBottomPadding,
  computeVisibleBottom,
  FOOTER_PADDING_KEYBOARD,
  FOOTER_PADDING_RESTING,
  SHEET_MIN_HEIGHT,
  computeFollowDelay,
  computeSheetOffset,
  SCROLL_SETTLE_MS,
  SHEET_MAX_OFFSET,
} from "./keyboardLayout";
import { computeScrollDelta } from "@/components/KeyboardAwareScrollView";

describe("computeKeyboardOverlap", () => {
  it("is the part of the window under the keyboard top edge", () => {
    expect(computeKeyboardOverlap(852, 516)).toBe(336);
  });
  it("is 0 when the keyboard is hidden (its top edge sits at the window bottom)", () => {
    expect(computeKeyboardOverlap(852, 852)).toBe(0);
  });
  it("never goes negative, above the window, or NaN", () => {
    expect(computeKeyboardOverlap(852, 900)).toBe(0);
    expect(computeKeyboardOverlap(852, -50)).toBe(852);
    expect(computeKeyboardOverlap(undefined, 516)).toBe(0);
    expect(computeKeyboardOverlap(852, NaN)).toBe(0);
  });
});

describe("computeSheetHeight", () => {
  it("uses the ratio of the window when no keyboard is up", () => {
    expect(computeSheetHeight({ windowHeight: 852, insetTop: 59 })).toBe(767);
    expect(computeSheetHeight({ windowHeight: 852, insetTop: 59, ratio: 0.8 })).toBe(682);
  });

  it("never reaches under the status bar", () => {
    expect(computeSheetHeight({ windowHeight: 800, insetTop: 200, ratio: 1 })).toBe(600);
  });

  it("with the keyboard up, fills ALL the space between the status bar and the keyboard", () => {
    // 852 window, 336 keyboard, 59 status bar => 457 (was 90% of 516 = 464 with ~270 of chrome).
    expect(
      computeSheetHeight({ windowHeight: 852, keyboardOverlap: 336, insetTop: 59 }),
    ).toBe(457);
  });

  it("never collapses below the minimum on tiny windows / tall keyboards", () => {
    expect(
      computeSheetHeight({ windowHeight: 500, keyboardOverlap: 400, insetTop: 20 }),
    ).toBe(SHEET_MIN_HEIGHT);
  });

  it("degrades to the minimum (never NaN) on bad input", () => {
    expect(computeSheetHeight({ windowHeight: undefined })).toBe(SHEET_MIN_HEIGHT);
    expect(computeSheetHeight({ windowHeight: NaN, keyboardOverlap: 300 })).toBe(SHEET_MIN_HEIGHT);
  });
});

describe("computeFooterBottomPadding", () => {
  it("drops the home-indicator inset while the keyboard is up (it covers that area)", () => {
    expect(computeFooterBottomPadding({ keyboardVisible: true, insetBottom: 34 })).toBe(
      FOOTER_PADDING_KEYBOARD,
    );
  });
  it("clears the home indicator at rest", () => {
    expect(computeFooterBottomPadding({ keyboardVisible: false, insetBottom: 34 })).toBe(
      34 + FOOTER_PADDING_RESTING,
    );
    expect(computeFooterBottomPadding({ keyboardVisible: false })).toBe(FOOTER_PADDING_RESTING);
  });
});

describe("computeVisibleBottom + scroll-into-view (the 'notes field hidden behind the footer' bug)", () => {
  it("is the smaller of the scroll view's bottom and the keyboard top", () => {
    expect(computeVisibleBottom(400, 516)).toBe(400);
    expect(computeVisibleBottom(700, 516)).toBe(516);
    expect(Number.isNaN(computeVisibleBottom(undefined, 516))).toBe(true);
  });

  it("scrolls an input that is above the keyboard but under the pinned footer", () => {
    // Sheet lifted above the keyboard: scroll view ends at y=400, the footer fills 400..516.
    // The notes input bottom is at y=480: above the keyboard (516) yet hidden under the footer.
    const scrollViewBottom = 400;
    const keyboardTop = 516;
    const inputBottom = 480;
    // Old rule (measured against the keyboard only): nothing to do, input stays hidden.
    expect(computeScrollDelta(inputBottom, keyboardTop)).toBe(0);
    // New rule: measured against what is actually visible.
    expect(
      computeScrollDelta(inputBottom, computeVisibleBottom(scrollViewBottom, keyboardTop)),
    ).toBe(480 + 16 - 400);
  });
});

// The Quick Check screenshot, as numbers. Chrome sizes are the real component's approximate
// heights (header, instruction block, footer hint + button); the point is the BUDGET, not pixels.
describe("scroll-area budget with the keyboard up (Quick Check)", () => {
  const chrome = { top: 20, header: 36, subheader: 60, footerHint: 32, footerButton: 68 };
  const OLD_BOTTOM = (insetBottom) => insetBottom + 20; // old: sheet paddingBottom = insets.bottom + 20

  const oldScrollArea = (win, kb, insetBottom) =>
    0.9 * (win - kb) -
    (chrome.top + chrome.header + chrome.subheader + chrome.footerHint + chrome.footerButton + OLD_BOTTOM(insetBottom));

  const newScrollArea = (win, kb, insetTop) =>
    computeSheetHeight({ windowHeight: win, keyboardOverlap: kb, insetTop }) -
    (chrome.top + chrome.header + /* subheader hidden */ 0 + chrome.footerButton +
      FOOTER_PADDING_KEYBOARD);

  it("large phone (852pt, 336pt keyboard): far more room than before", () => {
    const before = oldScrollArea(852, 336, 34);
    const after = newScrollArea(852, 336, 59);
    expect(before).toBeLessThan(200);
    expect(after).toBeGreaterThan(before + 100);
  });

  it("small phone (667pt SE-size, 260pt keyboard): usable instead of a sliver", () => {
    const before = oldScrollArea(667, 260, 0);
    const after = newScrollArea(667, 260, 20);
    expect(before).toBeLessThan(140);
    expect(after).toBeGreaterThan(before + 90);
    expect(after).toBeGreaterThan(200);
  });
});

describe("computeFollowDelay (focus switch / caret follow)", () => {
  it("uses the minimum delay once the last scroll has settled", () => {
    expect(computeFollowDelay(SCROLL_SETTLE_MS + 1, 60)).toBe(60);
    expect(computeFollowDelay(Number.MAX_SAFE_INTEGER, 0)).toBe(0);
  });

  it("waits out a scroll that is still animating", () => {
    expect(computeFollowDelay(0, 60)).toBe(SCROLL_SETTLE_MS);
    expect(computeFollowDelay(100, 60)).toBe(SCROLL_SETTLE_MS - 100);
  });

  it("never returns NaN or a negative delay", () => {
    expect(computeFollowDelay(undefined, 60)).toBe(60);
    expect(computeFollowDelay(NaN, NaN)).toBe(0);
    expect(computeFollowDelay(-5, -5)).toBe(0);
  });
});

describe("computeSheetOffset (pageSheet measurements are sheet-relative)", () => {
  // Simulator, iPhone 16 Pro Max: window 956, sheet scroll view measured at y=180, h=714.
  it("is the gap above the sheet", () => {
    expect(computeSheetOffset(956, 180 + 714)).toBe(62);
  });

  it("is 0 when the measurement is already in screen coordinates", () => {
    expect(computeSheetOffset(956, 956)).toBe(0);
    expect(computeSheetOffset(956, 1000)).toBe(0);
  });

  it("is capped, and 0 for a missing measurement", () => {
    expect(computeSheetOffset(956, 300)).toBe(SHEET_MAX_OFFSET);
    expect(computeSheetOffset(956, undefined)).toBe(0);
    expect(computeSheetOffset(NaN, 894)).toBe(0);
  });
});
