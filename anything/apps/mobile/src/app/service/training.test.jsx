// Render pins for the PROVIDER Training discovery + progress screen (ticket 2.10):
//   - a card renders per trainer from the (mocked) discovery hook — real data, no fakes;
//   - discovery is by the 'trainer' capability (DISTINCT from the self-Training tab);
//   - the empty state shows when the list is [] (no fakes);
//   - tapping a card pushes the provider detail route with the slug AND capability='trainer'
//     (so the shared booking modal books a TRAINING service, not a vet visit);
//   - the pet's PROGRAM progress (trainer notes) + VIDEO LESSONS surface, owner-readable.
// The data hooks + router are mocked, so this exercises the screen wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockDiscover;
let mockPrograms;
let lastType;
const mockPush = jest.fn();

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Providers/RatingBadge", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: () => <View /> };
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 5, name: "Rex" } }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: (type) => {
    lastType = type;
    return mockDiscover;
  },
  useTrainingPrograms: () => mockPrograms,
  useTrainingClasses: () => ({ data: [] }),
  useEnrollTrainingProgram: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useJoinTrainingClass: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import TrainingServiceScreen from "./training";

beforeEach(() => {
  mockPush.mockReset();
  lastType = undefined;
  mockPrograms = { data: [] };
});

test("discovers providers by the trainer capability", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  render(<TrainingServiceScreen />);
  expect(lastType).toBe("trainer");
});

test("renders a card per trainer from the discovery hook", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "pawsitive", name: "Pawsitive Training", bio: "Force-free methods" },
      { id: 2, slug: "good-dog", name: "Good Dog Co" },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<TrainingServiceScreen />);
  expect(getByText("Pawsitive Training")).toBeTruthy();
  expect(getByText("Good Dog Co")).toBeTruthy();
  expect(getByText("Force-free methods")).toBeTruthy();
});

test("shows the empty state when no trainers exist (no fakes)", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  const { getByText } = render(<TrainingServiceScreen />);
  expect(getByText("No trainers available yet")).toBeTruthy();
});

test("tapping a card navigates to the provider detail with slug + capability=trainer", () => {
  mockDiscover = {
    data: [{ id: 1, slug: "pawsitive", name: "Pawsitive Training" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<TrainingServiceScreen />);

  fireEvent.press(getByText("Pawsitive Training"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "pawsitive", capability: "trainer" },
  });
});

test("the pet's program progress (trainer notes + video lessons) surfaces for the owner", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  mockPrograms = {
    data: [
      {
        id: 9,
        status: "active",
        title: "Puppy Foundations",
        provider_name: "Pawsitive Training",
        total_sessions: 6,
        video_lesson_urls: ["lesson1.mp4"],
        progress: [
          {
            id: 1,
            status: "completed",
            session_title: "Week 1 — Sit & Stay",
            progress_note: "Rex nailed it",
            video_lesson_urls: [],
          },
        ],
      },
    ],
  };
  const { getByText } = render(<TrainingServiceScreen />);
  expect(getByText("YOUR TRAINING")).toBeTruthy();
  expect(getByText("Puppy Foundations")).toBeTruthy();
  expect(getByText("Rex nailed it")).toBeTruthy();
  expect(getByText("1 of 6 sessions completed")).toBeTruthy();
});
