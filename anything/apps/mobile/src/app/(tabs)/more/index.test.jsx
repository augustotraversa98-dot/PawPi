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
const mockDispatch = jest.fn();
let mockStackState;
let mockTabState;
let capturedBlurListener = null;
let capturedFocusListener = null;
const mockAddListener = jest.fn((event, cb) => {
  if (event === "blur") capturedBlurListener = cb;
  if (event === "focus") capturedFocusListener = cb;
  return jest.fn(); // unsubscribe
});
// The Profile ("more") tab is the selected tab when the screen subscribes.
const mockGetParent = jest.fn(() => ({
  addListener: mockAddListener,
  getState: () => mockTabState,
  isFocused: () => true,
}));

jest.mock("expo-router", () => ({
  useNavigation: () => ({
    getParent: mockGetParent,
    getState: () => mockStackState,
    dispatch: mockDispatch,
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
  mockDispatch.mockClear();
  mockGetParent.mockClear();
  mockAddListener.mockClear();
  capturedBlurListener = null;
  capturedFocusListener = null;
  // The More stack has a pushed screen on top of its root; the Profile tab is the selected tab (index 1).
  mockStackState = { key: "more-stack", index: 1 };
  mockTabState = { index: 1, routes: [{ key: "feed" }, { key: "more" }] };
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

test("pops the More stack to its root when the user switches to another tab", () => {
  render(<ProfileTab />);
  expect(mockDispatch).not.toHaveBeenCalled();

  mockTabState = { ...mockTabState, index: 0 }; // the user tapped the Feed tab
  capturedBlurListener();

  // Targeted at THIS stack's key: the action can never bubble up and pop the root stack.
  expect(mockDispatch).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "POP_TO_TOP", target: "more-stack" }));
});

// The regression: a root-stack screen pushed OVER the tabs (OwnerMenu → Family & caregivers, ...) also blurs the
// tab, but the tab is still the selected one. The old bare popToTop() bubbled and popped the ROOT stack — back to
// the onboarding wizard for a user who had just signed up. See utils/popStackOnTabLeave.test.jsx for the real
// navigator proof.
test("does NOT pop anything when the blur comes from a screen pushed over the tabs (tab still selected)", () => {
  render(<ProfileTab />);
  capturedBlurListener(); // Profile is still the selected tab: a root screen opened over the tabs
  expect(mockDispatch).not.toHaveBeenCalled();
});

test("does NOT dispatch when the More stack is already at its root (nothing to pop, so nothing to bubble)", () => {
  mockStackState = { key: "more-stack", index: 0 };
  render(<ProfileTab />);
  mockTabState = { ...mockTabState, index: 0 };
  capturedBlurListener();
  expect(mockDispatch).not.toHaveBeenCalled();
});

test("does nothing if there is no parent navigator (e.g. not yet mounted in a tab)", () => {
  mockGetParent.mockReturnValueOnce(undefined);
  expect(() => render(<ProfileTab />)).not.toThrow();
  expect(mockAddListener).not.toHaveBeenCalled();
});

// Launch dedupe: this tab is mounted at launch on iOS but must not mount (fetch) until first opened.
test("is withheld until the tab is first opened, then mounts", () => {
  const { NavigationContext } = require("@react-navigation/native");
  const { makeFakeNavigation } = require("@/utils/fakeNavigation");
  const { act } = require("@testing-library/react-native");
  const fake = makeFakeNavigation({ focused: false });
  const screen = render(
    <NavigationContext.Provider value={fake.navigation}>
      <ProfileTab />
    </NavigationContext.Provider>,
  );
  expect(screen.getByTestId("first-focus-placeholder")).toBeTruthy();
  expect(screen.queryByText("PET_PROFILE")).toBeNull();
  act(() => fake.focus());
  expect(screen.getByText("PET_PROFILE")).toBeTruthy();
});
