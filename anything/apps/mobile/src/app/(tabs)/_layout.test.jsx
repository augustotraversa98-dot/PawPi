// Pins the bottom-tab surface after the 2.0 nav promotion AND the iOS 26 Liquid
// Glass migration:
//   - "Services" is a primary bottom tab (Pet Services promoted into main nav);
//   - "Community" is NO LONGER a bottom tab (moved into More);
//   - the primary tabs (Feed / Health / Care / Services / Profile) are intact and
//     driven by the shared `tabsConfig` array (one source of truth for both bars);
//   - iOS renders the native Liquid Glass bar (expo-router/unstable-native-tabs);
//   - Android keeps the existing floating-pill JS <Tabs>.
// We mock both tab implementations to capture the declared tabs without a full
// navigation runtime, and toggle Platform.OS to exercise each branch.

import React from "react";
import { render } from "@testing-library/react-native";
import { Platform } from "react-native";
import en from "@/i18n/locales/en.json";
import { TABS } from "./tabsConfig";

// --- Android JS <Tabs> capture ---------------------------------------------
const androidScreens = [];
let capturedScreenOptions = null;
jest.mock("expo-router", () => {
  const Tabs = ({ children, screenOptions }) => {
    capturedScreenOptions = screenOptions;
    return <>{children}</>;
  };
  Tabs.Screen = ({ name, options }) => {
    androidScreens.push({ name, title: options?.title, options });
    return null;
  };
  return { Tabs };
});

// --- iOS native tabs capture ------------------------------------------------
const nativeTriggers = [];
let capturedNativeProps = null;
jest.mock("expo-router/unstable-native-tabs", () => {
  const NativeTabs = ({ children, ...props }) => {
    capturedNativeProps = props;
    return <>{children}</>;
  };
  NativeTabs.Trigger = ({ name, children }) => {
    nativeTriggers.push(name);
    return <>{children}</>;
  };
  return { NativeTabs, Icon: () => null, Label: () => null };
});

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
// The Profile tab icon (2.60) reads the current pet; stub the hook so importing
// the layout doesn't pull AsyncStorage/native deps into this structural test.
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: null }),
}));
jest.mock("@/components/Pets/PetAvatar", () => ({ PetAvatar: () => null }));
jest.mock("@/store/routinesStore", () => ({
  __esModule: true,
  default: { getState: () => ({ routines: [] }) },
}));
jest.mock("@/store/remindersStore", () => ({
  __esModule: true,
  default: { getState: () => ({ addReminderFromRoutine: jest.fn() }) },
}));
jest.mock("@/utils/reminderNotificationSync", () => ({
  startReminderNotificationSync: () => () => {},
}));
jest.mock("@/utils/notifications", () => ({
  getScheduledNotifications: () => Promise.resolve([]),
}));
jest.mock("@/utils/reminderGenerator", () => ({
  generateRemindersFromRoutine: () => [],
}));

import TabLayout from "./_layout";

const originalOS = Platform.OS;
beforeEach(() => {
  androidScreens.length = 0;
  nativeTriggers.length = 0;
  capturedScreenOptions = null;
  capturedNativeProps = null;
});
afterEach(() => {
  Platform.OS = originalOS;
});

// --- Shared config (platform-agnostic) -------------------------------------
describe("tabsConfig (single source of truth)", () => {
  test("the five primary tabs are intact and in order", () => {
    expect(TABS.map((t) => t.name)).toEqual([
      "index",
      "health",
      "training",
      "services",
      "more",
    ]);
  });

  test("Services is a primary tab labelled 'Stores & Vets'; Community is gone", () => {
    const services = TABS.find((t) => t.name === "services");
    expect(services).toBeTruthy();
    expect(en.tabs[services.titleKey.split(".")[1]]).toBe("Stores & Vets");
    expect(TABS.map((t) => t.name)).not.toContain("community");
  });

  test("the last tab is Profile (the `more` folder route), not More", () => {
    const last = TABS[TABS.length - 1];
    expect(last.name).toBe("more");
    expect(last.name).not.toBe("more/index");
    expect(en.tabs[last.titleKey.split(".")[1]]).toBe("Profile");
  });
});

// --- iOS: native Liquid Glass bar ------------------------------------------
describe("iOS native tab bar", () => {
  test("renders NativeTabs triggers for every route in order", () => {
    Platform.OS = "ios";
    render(<TabLayout />);
    expect(nativeTriggers).toEqual([
      "index",
      "health",
      "training",
      "services",
      "more",
    ]);
  });

  test("enables Instagram-style shrink-on-scroll (minimizeBehavior)", () => {
    Platform.OS = "ios";
    render(<TabLayout />);
    expect(capturedNativeProps?.minimizeBehavior).toBe("onScrollDown");
  });

  test("does NOT set a custom background/blur (system renders Liquid Glass)", () => {
    Platform.OS = "ios";
    render(<TabLayout />);
    // Setting these would defeat the real iOS 26 material.
    expect(capturedNativeProps?.backgroundColor).toBeUndefined();
    expect(capturedNativeProps?.blurEffect).toBeUndefined();
  });

  test("does not render the Android JS <Tabs> on iOS", () => {
    Platform.OS = "ios";
    render(<TabLayout />);
    expect(androidScreens).toHaveLength(0);
  });
});

// --- Android: existing floating-pill JS bar --------------------------------
describe("Android JS tab bar", () => {
  test("declares the same five routes in order", () => {
    Platform.OS = "android";
    render(<TabLayout />);
    expect(androidScreens.map((s) => s.name)).toEqual([
      "index",
      "health",
      "training",
      "services",
      "more",
    ]);
  });

  test("the bottom-right tab is Profile, not More/Community (2.39)", () => {
    Platform.OS = "android";
    render(<TabLayout />);
    const titles = androidScreens.map((s) => s.title);
    expect(titles[titles.length - 1]).toBe("Profile");
    expect(titles).not.toContain("More");
    expect(titles).not.toContain("Community");
  });

  test("Services / More keep popToTopOnBlur (ticket 2.19)", () => {
    Platform.OS = "android";
    render(<TabLayout />);
    const byName = Object.fromEntries(
      androidScreens.map((s) => [s.name, s.options]),
    );
    expect(byName.services.popToTopOnBlur).toBe(true);
    expect(byName.more.popToTopOnBlur).toBe(true);
    expect(byName.index.popToTopOnBlur).toBeUndefined();
  });

  test("the bar is a floating pill lifted off the bottom (ticket 2.59)", () => {
    Platform.OS = "android";
    render(<TabLayout />);
    const bar = capturedScreenOptions.tabBarStyle;
    expect(bar.borderRadius).toBeGreaterThan(0); // rounded pill
    expect(bar.marginHorizontal).toBeGreaterThan(0); // side margins (detached)
    expect(bar.marginBottom).toBeGreaterThanOrEqual(12); // lifted above indicator
    expect(bar.borderTopWidth).toBe(0); // no top hairline
    expect(bar.elevation).toBeGreaterThan(0); // shadow/elevation
  });

  test("does not render the iOS NativeTabs on Android", () => {
    Platform.OS = "android";
    render(<TabLayout />);
    expect(nativeTriggers).toHaveLength(0);
  });
});
