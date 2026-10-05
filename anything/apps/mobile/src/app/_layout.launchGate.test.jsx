// Launch gate: nothing that calls the API for the SIGNED-IN user may start before the session is
// ready and authenticated. The root layout used to start the telehealth-bookings poll
// (GET /api/me/bookings) on mount — a request at +1.5 s regardless of auth: a guaranteed 401 for a
// signed-out user and a request racing the auth hydration for a signed-in one.

import React from "react";
import { render, act } from "@testing-library/react-native";

let mockAuthState;
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => mockAuthState }));
jest.mock("expo-router", () => {
  const Stack = ({ children }) => children ?? null;
  Stack.Screen = () => null;
  return { Stack, usePathname: () => "/" };
});
jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }) => children,
}));
jest.mock("@/utils/connectivity", () => ({ wireQueryConnectivity: jest.fn() }));
jest.mock("@/utils/reminderNotificationSync", () => ({ startReminderNotificationSync: jest.fn(() => () => {}) }));
const mockStopTelehealth = jest.fn();
const mockStartTelehealth = jest.fn(() => mockStopTelehealth);
jest.mock("@/utils/telehealthReminderSync", () => ({
  startTelehealthReminderSync: (...a) => mockStartTelehealth(...a),
}));
jest.mock("@/utils/notifications", () => ({ initNotifications: jest.fn() }));
jest.mock("@/utils/registerPushToken", () => ({ registerPushTokenAsync: jest.fn() }));
jest.mock("@/utils/notificationDeepLink", () => ({ registerNotificationTapRouting: jest.fn(() => () => {}) }));
jest.mock("@/utils/notificationPreferences", () => ({ recordAppOpenHour: jest.fn() }));
jest.mock("@/utils/auth/useAuthModal", () => ({ AuthModal: () => null }));
jest.mock("@/components/OfflineBanner", () => ({ OfflineBanner: () => null }));
jest.mock("@/components/ErrorBoundary", () => ({ ErrorBoundary: ({ children }) => children }));
jest.mock("@/i18n", () => ({}));
jest.mock("@/i18n/localePreference", () => ({ initLocaleFromStorage: jest.fn() }));
jest.mock("../../__create/boot-trace", () => ({ markBootStep: jest.fn() }));
jest.mock("@/utils/navTrail", () => ({ recordRoute: jest.fn() }));
jest.mock("@/telemetry/TelemetryProvider", () => ({ useTelemetryLifecycle: jest.fn() }));

import RootLayout from "./_layout";

const state = (over) => ({
  initiate: jest.fn(),
  isReady: true,
  isAuthenticated: true,
  auth: { jwt: "j", user: { id: 1 } },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

test("signed OUT (or session not ready): the bookings poll is never started", () => {
  mockAuthState = state({ isReady: false, isAuthenticated: null, auth: null });
  const { rerender } = render(<RootLayout />);
  expect(mockStartTelehealth).not.toHaveBeenCalled();

  mockAuthState = state({ isReady: true, isAuthenticated: false, auth: null });
  rerender(<RootLayout />);
  expect(mockStartTelehealth).not.toHaveBeenCalled();
});

test("signed in: started exactly once; signing out stops it", () => {
  mockAuthState = state({ isReady: false, isAuthenticated: null, auth: null });
  const { rerender } = render(<RootLayout />);

  mockAuthState = state();
  rerender(<RootLayout />);
  expect(mockStartTelehealth).toHaveBeenCalledTimes(1);
  rerender(<RootLayout />); // an unrelated re-render does not restart it
  expect(mockStartTelehealth).toHaveBeenCalledTimes(1);

  mockAuthState = state({ isAuthenticated: false, auth: null });
  rerender(<RootLayout />);
  expect(mockStopTelehealth).toHaveBeenCalledTimes(1);
});
