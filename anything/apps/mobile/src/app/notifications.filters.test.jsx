// The filter pills were cut off in Spanish (TestFlight): the horizontal row was squeezed by the long list under
// it, slicing every label in half. Jest has no layout engine, so this renders every pill with the real Spanish
// catalog and locks the style rules that keep the row from shrinking and the pills sized by their text.

import React from "react";
import { StyleSheet } from "react-native";
import { render, within } from "@testing-library/react-native";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock("es"));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/store/socialPetStore", () => ({
  __esModule: true,
  default: (selector) => selector({ notifications: [], markNotificationAsRead: jest.fn(), markAllNotificationsAsRead: jest.fn() }),
}));
jest.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
  useMarkNotificationsRead: () => ({ mutate: jest.fn() }),
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({ useAllCareAccessGrants: () => ({ data: [] }) }));
jest.mock("@/hooks/useRecentVetNotes", () => ({ useRecentVetNotes: () => ({ data: [] }) }));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: null }) }));
jest.mock("@/utils/handleNotificationTap", () => ({
  handleNotificationTap: jest.fn(),
  getNotificationDisplayInfo: () => ({ icon: "🔔", color: "#000000" }),
}));

import NotificationsScreen from "./notifications";

const es = require("@/i18n/locales/es.json");
const PILLS = [
  ["All", es.notifications.filterAll],
  ["Requests", es.notifications.filterRequests],
  ["Bookings", es.notifications.filterBookings],
  ["Walks", es.notifications.filterWalks],
  ["Feeding", es.notifications.filterFeeding],
  ["Paws", es.notifications.filterPaws],
  ["Barks", es.notifications.filterBarks],
  ["Training", es.notifications.filterTraining],
];

test.each(PILLS)("the %s pill shows its full Spanish label, never truncated", (id, label) => {
  const { getByTestId } = render(<NotificationsScreen />);
  const pill = getByTestId(`notifications-filter-${id}`);
  const text = within(pill).getByText(label);
  expect(label).toBeTruthy();
  expect(text.props.numberOfLines).toBeUndefined();
  expect(text.props.allowFontScaling).not.toBe(false);

  const style = StyleSheet.flatten(pill.props.style);
  expect(style.height).toBeUndefined();
  expect(style.width).toBeUndefined();
  expect(style.maxHeight).toBeUndefined();
  expect(style.minHeight).toBeGreaterThanOrEqual(36);
  expect(style.flexShrink).toBe(0);
});

test("the pill row cannot be squeezed by the list below it", () => {
  const { getByTestId } = render(<NotificationsScreen />);
  const row = StyleSheet.flatten(getByTestId("notifications-filters").props.style);
  expect(row.flexShrink).toBe(0);
  expect(row.flexGrow).toBe(0);
  expect(row.height).toBeUndefined();
  expect(StyleSheet.flatten(getByTestId("notifications-list").props.style).flex).toBe(1);
});
