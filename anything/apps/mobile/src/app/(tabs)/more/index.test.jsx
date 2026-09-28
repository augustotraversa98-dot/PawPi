// The bottom-right "Profile" tab (ticket 2.60) is now a thin wrapper that renders
// the pet social profile in `embedded` mode (current-pet fallback + ☰ owner menu).
// The profile behavior is covered by pet-profile.test; the burger menu by
// OwnerMenu.test — here we pin that the tab delegates with embedded=true, plus
// the nav-stack-corruption regression guard below.
//
// That bug: leave Profile for a pushed screen (Reminders & Routines, Settings,
// ...), switch to another bottom tab, then tap back into Profile — you used to
// land back on the stale pushed screen instead of the tab's root, because the
// 2.19 `popToTopOnBlur` fix only exists on the Android JS <Tabs> bar. iOS's
// NativeTabs bar has no such option — it only pops to root on a REPEAT tap of
// an already-active tab (Apple's native `specialEffects.repeatedTabSelection`),
// not when switching TO the tab from elsewhere.
//
// The fix resets the More stack from the navigation-state level instead of the
// tab-bar level: this screen (the stack's permanently-mounted `index`/base
// route) listens for its PARENT (the "more" Tab screen) to blur — i.e. the
// user switching away to any other tab, on any platform — and pops the Stack
// back to itself. The tests below pin that wiring directly, without needing a
// full NativeTabs vs. Android <Tabs> navigation runtime.

import React from "react";
import { render } from "@testing-library/react-native";

let lastProps;
const mockPopToTop = jest.fn();
let capturedBlurListener = null;
const mockAddListener = jest.fn((event, cb) => {
  if (event === "blur") capturedBlurListener = cb;
  return jest.fn(); // unsubscribe
});
const mockGetParent = jest.fn(() => ({ addListener: mockAddListener }));

jest.mock("expo-router", () => ({
  useNavigation: () => ({
    getParent: mockGetParent,
    popToTop: mockPopToTop,
  }),
}));
jest.mock("@/app/pet-profile", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: (props) => {
      lastProps = props;
      return <Text>PET_PROFILE</Text>;
    },
  };
});

import ProfileTab from "./index";

beforeEach(() => {
  lastProps = undefined;
  mockPopToTop.mockClear();
  mockGetParent.mockClear();
  mockAddListener.mockClear();
  capturedBlurListener = null;
});

test("the Profile tab renders the pet social profile in embedded mode", () => {
  const { getByText } = render(<ProfileTab />);
  expect(getByText("PET_PROFILE")).toBeTruthy();
  expect(lastProps.embedded).toBe(true);
});

test("subscribes to the parent (Tab) screen's blur event", () => {
  render(<ProfileTab />);
  expect(mockGetParent).toHaveBeenCalled();
  expect(mockAddListener).toHaveBeenCalledWith("blur", expect.any(Function));
});

test("pops the More stack to its root when the tab loses focus", () => {
  render(<ProfileTab />);
  expect(mockPopToTop).not.toHaveBeenCalled();

  capturedBlurListener();

  expect(mockPopToTop).toHaveBeenCalledTimes(1);
});

test("does nothing if there is no parent navigator (e.g. not yet mounted in a tab)", () => {
  mockGetParent.mockReturnValueOnce(undefined);
  expect(() => render(<ProfileTab />)).not.toThrow();
  expect(mockAddListener).not.toHaveBeenCalled();
});
