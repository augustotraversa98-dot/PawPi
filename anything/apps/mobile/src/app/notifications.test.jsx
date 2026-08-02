// Notifications on real data (ticket 2.26): merges real social notifications (API) with
// local reminder notifications (store), filters, empty state, tap-through, mark-all. The
// data hooks + store + router are mocked — no mock notification data is used.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockStoreState;
let mockDbNotifications;
let mockCareGrants;
let mockVetNotes;
let mockCurrentPet;
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockMarkRead = jest.fn();
const mockHandleTap = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));
// Resolve t() against the real English catalog (with {{var}} interpolation) so
// assertions stay in English AND a typo'd key surfaces as a failing test.
jest.mock("react-i18next", () => {
  const en = require("@/i18n/locales/en.json");
  const resolve = (k) =>
    k.split(".").reduce((o, part) => (o == null ? o : o[part]), en);
  return {
    useTranslation: () => ({
      t: (key, vars) => {
        let s = resolve(key);
        if (typeof s !== "string") return key;
        if (vars)
          for (const [name, val] of Object.entries(vars))
            s = s.replace(new RegExp(`{{${name}}}`, "g"), String(val));
        return s;
      },
    }),
  };
});
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/store/socialPetStore", () => ({
  __esModule: true,
  default: (selector) => selector(mockStoreState),
}));
jest.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({ data: mockDbNotifications }),
  useMarkNotificationsRead: () => ({ mutate: mockMarkRead }),
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useAllCareAccessGrants: () => ({ data: mockCareGrants }),
}));
jest.mock("@/hooks/useRecentVetNotes", () => ({
  useRecentVetNotes: () => ({ data: mockVetNotes }),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockCurrentPet }),
}));
jest.mock("@/utils/handleNotificationTap", () => ({
  handleNotificationTap: (...args) => mockHandleTap(...args),
  getNotificationDisplayInfo: () => ({ icon: "🔔", color: "#000000" }),
}));

import NotificationsScreen from "./notifications";

const reminderNotif = {
  id: "rem1",
  reminderId: "r-1",
  type: "walk",
  title: "Walk time",
  message: "Time for a walk",
  timestamp: "2026-06-17T08:00:00.000Z",
  read: false,
  actionLabel: "Log walk",
};

const dbPaw = {
  id: 1,
  type: "paw",
  subject_ref: "5",
  body: "pawed your post",
  read_at: null,
  created_at: "2026-06-17T09:00:00.000Z",
  actor_username: "jane",
  actor_avatar: null,
};
const dbFollow = {
  id: 2,
  type: "follow",
  subject_ref: "42",
  body: "started following your pet",
  read_at: null,
  created_at: "2026-06-17T10:00:00.000Z",
  actor_username: "mike",
  actor_avatar: null,
};

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockMarkRead.mockReset();
  mockHandleTap.mockReset();
  mockStoreState = {
    notifications: [reminderNotif],
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  };
  mockDbNotifications = [dbPaw, dbFollow];
  mockCareGrants = [];
  mockVetNotes = [];
  mockCurrentPet = { id: 1, name: "Mango" };
});

// A vet-authored note (has vet_name) created "just now" so it's inside the window.
const recentVetNote = {
  id: 9,
  vet_name: "Dr. Vet",
  note: "All good",
  created_at: new Date(Date.now() - 60000).toISOString(),
};

const pendingGrant = {
  id: 77,
  status: "pending",
  provider_name: "Dr. Vet",
  pet_name: "Mango",
  created_at: "2026-06-17T11:00:00.000Z",
};

test("merges real social notifications with local reminder notifications", () => {
  const { getByText } = render(<NotificationsScreen />);
  expect(getByText("Walk time")).toBeTruthy(); // reminder (store)
  expect(getByText("pawed your post")).toBeTruthy(); // social (API)
  expect(getByText("started following your pet")).toBeTruthy();
});

test("filtering by Paws shows only paw notifications", () => {
  const { getByText, queryByText } = render(<NotificationsScreen />);
  fireEvent.press(getByText("Paws"));
  expect(getByText("pawed your post")).toBeTruthy();
  expect(queryByText("Walk time")).toBeNull();
  expect(queryByText("started following your pet")).toBeNull();
});

test("tapping a follow notification opens the pet profile and marks it read", () => {
  const { getByText } = render(<NotificationsScreen />);
  fireEvent.press(getByText("started following your pet"));
  expect(mockMarkRead).toHaveBeenCalledWith({ ids: [2] });
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/pet-profile",
    params: { petId: "42" },
  });
});

test("Mark all read marks both store reminders and API notifications", () => {
  const { getByText } = render(<NotificationsScreen />);
  fireEvent.press(getByText("Mark all read"));
  expect(mockStoreState.markAllNotificationsRead).toHaveBeenCalled();
  expect(mockMarkRead).toHaveBeenCalledWith({ all: true });
});

test("a pending care-access request appears in the bell and routes to Data Access", () => {
  mockCareGrants = [pendingGrant];
  const { getByText } = render(<NotificationsScreen />);
  // Surfaced with provider name + which pet's records are requested.
  expect(getByText("Dr. Vet")).toBeTruthy();
  expect(getByText("wants access to Mango's records")).toBeTruthy();
  // Tapping takes the owner to the trust screen to approve/deny.
  fireEvent.press(getByText("wants access to Mango's records"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/data-access");
});

test("a recent vet note surfaces in the bell and opens the Health tab", () => {
  mockVetNotes = [recentVetNote];
  const { getByText } = render(<NotificationsScreen />);
  expect(getByText("Dr. Vet")).toBeTruthy();
  expect(getByText("added a note to Mango")).toBeTruthy();
  fireEvent.press(getByText("added a note to Mango"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/health");
});

test("an owner-authored note (no vet_name) does NOT surface in the bell", () => {
  mockVetNotes = [{ id: 10, vet_name: null, created_at: new Date().toISOString() }];
  const { queryByText } = render(<NotificationsScreen />);
  expect(queryByText("added a note to Mango")).toBeNull();
});

test("a stale vet note (older than the window) does NOT surface", () => {
  mockVetNotes = [
    {
      id: 11,
      vet_name: "Dr. Old",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    },
  ];
  const { queryByText } = render(<NotificationsScreen />);
  expect(queryByText("Dr. Old")).toBeNull();
});

test("only pending grants surface (active/revoked are excluded)", () => {
  mockCareGrants = [
    pendingGrant,
    { ...pendingGrant, id: 78, status: "active", provider_name: "Old Vet" },
  ];
  const { queryByText } = render(<NotificationsScreen />);
  expect(queryByText("Dr. Vet")).toBeTruthy();
  expect(queryByText("Old Vet")).toBeNull();
});

test("Requests filter shows only care-access requests", () => {
  mockCareGrants = [pendingGrant];
  const { getByText, queryByText } = render(<NotificationsScreen />);
  fireEvent.press(getByText("Requests"));
  expect(getByText("Dr. Vet")).toBeTruthy();
  expect(queryByText("Walk time")).toBeNull();
  expect(queryByText("pawed your post")).toBeNull();
});

test("all seven filter chips render in the row (2.33 layout fix)", () => {
  const { getByText, UNSAFE_getAllByType } = render(<NotificationsScreen />);
  // All seven options render...
  for (const label of [
    "All",
    "Requests",
    "Walks",
    "Feeding",
    "Paws",
    "Barks",
    "Training",
  ]) {
    expect(getByText(label)).toBeTruthy();
  }
  // ...inside a horizontal ScrollView whose content centers items so each chip
  // sizes to its content (the fix: no vertical stretch into tall rectangles).
  const { ScrollView } = require("react-native");
  const chipRow = UNSAFE_getAllByType(ScrollView).find((sv) => {
    const cc = sv.props.contentContainerStyle;
    const flat = Array.isArray(cc) ? Object.assign({}, ...cc) : cc;
    return flat && flat.alignItems === "center";
  });
  expect(chipRow).toBeTruthy();
});

test("empty state when there are no notifications", () => {
  mockStoreState = {
    notifications: [],
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  };
  mockDbNotifications = [];
  const { getByText } = render(<NotificationsScreen />);
  expect(getByText("No new notifications yet")).toBeTruthy();
});
