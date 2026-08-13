// Pins the bottom-tab surface after the 2.0 nav promotion:
//   - "Services" is a primary bottom tab (Pet Services promoted into main nav);
//   - "Community" is NO LONGER a bottom tab (moved into More);
//   - the rest of the primary tabs (Feed / Health / Training / More) are intact.
// We mock expo-router's <Tabs>/<Tabs.Screen> to capture the declared screens
// and their titles without needing a full navigation runtime.

import React from "react";
import { render } from "@testing-library/react-native";

const screens = [];
let capturedScreenOptions = null;

jest.mock("expo-router", () => {
  const Tabs = ({ children, screenOptions }) => {
    capturedScreenOptions = screenOptions;
    return <>{children}</>;
  };
  Tabs.Screen = ({ name, options }) => {
    screens.push({ name, title: options?.title });
    return null;
  };
  return { Tabs };
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

beforeEach(() => {
  screens.length = 0;
});

test("Services is a primary bottom tab; Community is not", () => {
  render(<TabLayout />);
  const names = screens.map((s) => s.name);
  const titles = screens.map((s) => s.title);

  // The route name stays `services` (deep-link/test stability); the label is now "Stores & Vets" (D1).
  expect(names).toContain("services");
  expect(titles).toContain("Stores & Vets");

  expect(names).not.toContain("community");
  expect(titles).not.toContain("Community");
});

test("the other primary tabs are intact", () => {
  render(<TabLayout />);
  const names = screens.map((s) => s.name);
  expect(names).toEqual(["index", "health", "training", "services", "more"]);
});

test("the bottom-right tab is now Profile, not More (ticket 2.39)", () => {
  render(<TabLayout />);
  const titles = screens.map((s) => s.title);
  // Same route slot (the `more` folder) but presented as the owner's Profile.
  expect(titles[titles.length - 1]).toBe("Profile");
  expect(titles).not.toContain("More");
});

// Regression guard (device bug): the `more/` route is a FOLDER (it has its own
// _layout), so its tab route segment is "more" — NOT "more/index". Declaring
// "more/index" matched no tab route, so expo-router dropped the Profile title +
// avatar icon + popToTopOnBlur and the tab fell back to the segment label "more"
// with a default icon. The 5th tab's options MUST be attached to name "more".
test("the Profile tab targets the real `more` folder route (not more/index)", () => {
  render(<TabLayout />);
  const profile = screens[screens.length - 1];
  expect(profile.name).toBe("more");
  expect(profile.name).not.toBe("more/index");
  // The Profile title + icon must ride on that same matched route.
  expect(profile.title).toBe("Profile");
});

test("the tab bar is a floating pill, lifted off the bottom (ticket 2.59)", () => {
  render(<TabLayout />);
  const bar = capturedScreenOptions.tabBarStyle;
  expect(bar.borderRadius).toBeGreaterThan(0); // rounded pill
  expect(bar.marginHorizontal).toBeGreaterThan(0); // side margins (detached)
  expect(bar.marginBottom).toBeGreaterThanOrEqual(12); // lifted above home indicator
  expect(bar.borderTopWidth).toBe(0); // no top hairline
  expect(bar.elevation).toBeGreaterThan(0); // shadow/elevation
});
