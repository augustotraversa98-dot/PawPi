// Render pins for "Rex's Week" (E11): real stats render as the true numbers; a quiet/empty week
// degrades to the honest headline (no fabricated numbers); friends strip + milestone render when
// present; toggling a channel PUTs the pref. i18n resolves against the real English catalog.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockDigest;
let mockPrefs;
let mockMutate;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: (...a) => mockRouterPush(...a) }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => <View {...props} /> };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
let mockShareProps;
const mockRouterPush = jest.fn();
jest.mock("@/components/Feed/MemoryShareButton", () => {
  const { Text } = require("react-native");
  return {
    MemoryShareButton: (props) => {
      mockShareProps = props;
      return <Text testID="memory-share">{props.label}</Text>;
    },
  };
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Rex" } }),
}));
jest.mock("@/hooks/useWeeklyDigest", () => ({
  useWeeklyDigest: () => mockDigest,
  useWeeklyDigestPrefs: () => mockPrefs,
  useUpdateWeeklyDigestPrefs: () => ({ mutate: mockMutate }),
}));

import WeeklyDigestScreen from "./weekly-digest";

beforeEach(() => {
  mockShareProps = undefined;
  mockRouterPush.mockReset();
  mockMutate = jest.fn();
  mockPrefs = { data: { push_enabled: true, email_enabled: false } };
  mockDigest = {
    isLoading: false,
    data: {
      state: "rich",
      walks: 5,
      ring_days_closed: 4,
      ring_days_total: 7,
      care_actions: 6,
      moments: 3,
      streak: { current: 12, longest: 20 },
      best_moment: { post_id: 9, image_url: "a.png", caption: "park day", paws: 4 },
      week_moments: [
        { post_id: 9, photo_url: "a.png", post_date: "2026-08-13" },
        { post_id: 10, photo_url: "b.png", post_date: "2026-08-14" },
        { post_id: 8, photo_url: "c.png", post_date: "2026-08-11" },
      ],
      friends: [{ pet_id: 2, name: "Bella", avatar_url: "b.png" }],
      milestone: { kind: "birthday", in_days: 3 },
    },
  };
});

test("a rich week renders the real numbers", () => {
  const { getByTestId, getByText } = render(<WeeklyDigestScreen />);
  expect(getByText("What a week, Rex! 🐾")).toBeTruthy();
  expect(getByTestId("tile-walks-value")).toHaveTextContent("5");
  expect(getByTestId("tile-ring-value")).toHaveTextContent("4/7");
  expect(getByTestId("tile-streak-value")).toHaveTextContent("12");
  expect(getByTestId("best-moment")).toBeTruthy();
  expect(getByTestId("friend-2")).toBeTruthy();
  expect(getByTestId("milestone-preview")).toBeTruthy();
});

test("an empty week shows the honest headline and zeroed tiles (no fake numbers)", () => {
  mockDigest = {
    isLoading: false,
    data: {
      state: "empty", walks: 0, ring_days_closed: 0, ring_days_total: 7,
      care_actions: 0, moments: 0, streak: null, best_moment: null, friends: [], milestone: null,
    },
  };
  const { getByTestId, getByText, queryByTestId } = render(<WeeklyDigestScreen />);
  expect(getByText("A fresh week is waiting for Rex 🐾")).toBeTruthy();
  expect(getByTestId("tile-walks-value")).toHaveTextContent("0");
  expect(queryByTestId("best-moment")).toBeNull();
  expect(queryByTestId("friends-strip")).toBeNull();
});

test("toggling email PUTs the pref", () => {
  const { getByTestId } = render(<WeeklyDigestScreen />);
  fireEvent(getByTestId("pref-email"), "valueChange", true);
  expect(mockMutate).toHaveBeenCalledWith({ email_enabled: true });
});


describe("share card", () => {
  it("the button label shows the real pet name — no raw {{placeholder}} anywhere", () => {
    const { getByTestId, toJSON } = render(<WeeklyDigestScreen />);
    expect(getByTestId("memory-share")).toHaveTextContent("Share Rex's week");
    expect(JSON.stringify(toJSON())).not.toContain("{{");
  });

  it("defaults to the best moment and lists only the week's moments in the picker", () => {
    const { getByTestId, queryByTestId } = render(<WeeklyDigestScreen />);
    expect(mockShareProps.card.photoUri).toBe("a.png");
    expect(getByTestId("share-pick-9")).toBeTruthy();
    expect(getByTestId("share-pick-10")).toBeTruthy();
    expect(getByTestId("share-pick-8")).toBeTruthy();
    expect(queryByTestId("share-pick-99")).toBeNull();
    expect(getByTestId("share-pick-9").props.accessibilityState.selected).toBe(true);
  });

  it("picking a moment updates the preview and the exported card", () => {
    const { getByTestId } = render(<WeeklyDigestScreen />);
    fireEvent.press(getByTestId("share-pick-10"));
    expect(mockShareProps.card.photoUri).toBe("b.png");
    expect(getByTestId("share-preview").props.source.uri).toBe("b.png");
    expect(getByTestId("share-pick-10").props.accessibilityState.selected).toBe(true);
  });

  it("zero-activity week: the shared frame has no zero stats", () => {
    mockDigest = {
      isLoading: false,
      data: {
        state: "empty", walks: 0, ring_days_closed: 0, ring_days_total: 7, care_actions: 0, moments: 0,
        streak: null, best_moment: null, week_moments: [], friends: [], milestone: null,
        pet: { id: 7, avatar_url: "avatar.png" },
      },
    };
    render(<WeeklyDigestScreen />);
    expect(mockShareProps.card.photoUri).toBe("avatar.png"); // no moments -> profile photo
    expect(mockShareProps.card.subtitle).toBe("A fresh week starts today");
    expect(mockShareProps.card.headline + mockShareProps.card.subtitle).not.toMatch(/\d/);
  });

  it("no moments and no profile photo: asks for a daily moment (opens the composer), no paw card", () => {
    mockDigest = {
      isLoading: false,
      data: {
        state: "empty", walks: 0, ring_days_closed: 0, ring_days_total: 7, care_actions: 0, moments: 0,
        streak: null, best_moment: null, week_moments: [], friends: [], milestone: null,
      },
    };
    const { getByTestId, queryByTestId } = render(<WeeklyDigestScreen />);
    expect(queryByTestId("memory-share")).toBeNull();
    expect(getByTestId("share-prompt")).toBeTruthy();
    fireEvent.press(getByTestId("share-prompt-cta"));
    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/(tabs)", params: expect.objectContaining({ compose: expect.any(String) }) }),
    );
  });
});
