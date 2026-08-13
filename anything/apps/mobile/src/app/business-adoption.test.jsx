// Business hub → Adoption applications review (ticket A2, extended by A3). Proves:
//   • cards render (applicant + status chip + contact + answers); empty + error states (no crash);
//   • Approve fires the review mutation with "approved" ONLY AFTER the confirm; Decline (confirm) +
//     Mark under review fire theirs; a 409 surfaces the "already decided" copy;
//   • A3: grouped BY DOG (a header per listing with a count); search filters the list + a no-match
//     shows the empty-search state; declined applications sort LAST within their dog group; the
//     Message action opens/reuses a thread then navigates to /provider-chat with the right params.
// The provider hooks are mocked so the test drives the screen logic directly.
// (jest.mock factories may only reference `mock`-prefixed module vars, hence the naming.)

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, within, act } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);

// Stable date formatter for the "Submitted:" line.
jest.mock("@/utils/canonicalDateTime", () => ({
  formatDisplayDate: (d) => `D:${d}`,
}));

// RefreshableScrollView double — records the refetch prop and exposes a pull affordance.
const mockRefreshable = { props: null };
jest.mock("@/components/RefreshableScrollView", () => {
  const { ScrollView, Text, TouchableOpacity } = require("react-native");
  return {
    RefreshableScrollView: (props) => {
      mockRefreshable.props = props;
      const { refetch, children, ...rest } = props;
      const pull = () => (Array.isArray(refetch) ? refetch : [refetch]).forEach((fn) => fn && fn());
      return (
        <ScrollView {...rest} testID="refreshable-scroll">
          <TouchableOpacity testID="pull-to-refresh" onPress={pull}>
            <Text>PULL</Text>
          </TouchableOpacity>
          {children}
        </ScrollView>
      );
    },
  };
});

// Active provider (adoption-capable by default).
const mockActive = { activeProvider: { id: 8, name: "Shelter", capabilities: ["adoption"] } };
jest.mock("@/hooks/useActiveProvider", () => ({
  useActiveProvider: () => mockActive,
}));

// Applications read + review + open-thread mutations (all mocked at the hook boundary).
const mockAppsState = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
const mockReview = { mutate: jest.fn(), isPending: false, boundId: null };
const mockOpenThread = {
  mutateAsync: jest.fn().mockResolvedValue({ thread: { id: 55 }, reused: false }),
  boundId: null,
};
jest.mock("@/hooks/useProviders", () => ({
  useProviderAdoptionApplications: () => mockAppsState,
  useReviewProviderAdoptionApplication: (id) => {
    mockReview.boundId = id;
    return { mutate: mockReview.mutate, isPending: mockReview.isPending };
  },
  useOpenAdoptionApplicantThread: (id) => {
    mockOpenThread.boundId = id;
    return { mutateAsync: mockOpenThread.mutateAsync };
  },
}));

jest.mock("@/hooks/useUserProfile", () => ({ useMyProfileId: () => ({ data: 7 }) }));

import BusinessAdoptionScreen from "./business-adoption";

const APP_OPEN = {
  id: 1,
  status: "submitted",
  created_at: "2026-08-10",
  listing_id: 100,
  listing_name: "Rex",
  listing_breed: "Labrador",
  listing_status: "available",
  applicant_name: "Ana Pérez",
  applicant_email: "ana@example.com",
  applicant_owner_user_id: 3,
  answers: [
    { question: "Best contact number", answer: "+54 11 5555 1234" },
    { question: "Why do you want to adopt?", answer: "We love dogs" },
  ],
};

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockAppsState.data = [];
  mockAppsState.isLoading = false;
  mockAppsState.isError = false;
  mockAppsState.refetch = jest.fn();
  mockReview.mutate = jest.fn();
  mockReview.isPending = false;
  mockReview.boundId = null;
  mockOpenThread.mutateAsync = jest.fn().mockResolvedValue({ thread: { id: 55 }, reused: false });
  mockOpenThread.boundId = null;
  mockRefreshable.props = null;
});

test("lists an application with applicant, status chip, contact and answers under its dog group", () => {
  mockAppsState.data = [APP_OPEN];
  const { getByTestId, getByText } = render(<BusinessAdoptionScreen />);

  // Grouped by dog: a group header carries the dog name + breed + a count.
  const group = getByTestId("adoption-group-100");
  expect(within(group).getByText("Rex · Labrador")).toBeTruthy();
  expect(within(group).getByText("1 applications")).toBeTruthy();

  const card = getByTestId("adoption-app-1");
  expect(within(card).getByText("Ana Pérez")).toBeTruthy();
  expect(within(card).getByText("Submitted")).toBeTruthy();
  expect(within(card).getByText("ana@example.com")).toBeTruthy();
  expect(within(card).getByText("+54 11 5555 1234")).toBeTruthy();
  expect(within(card).getByText("We love dogs")).toBeTruthy();

  // both mutation hooks bound to the active provider id
  expect(mockReview.boundId).toBe(8);
  expect(mockOpenThread.boundId).toBe(8);

  fireEvent.press(getByTestId("adoption-back"));
  expect(mockBack).toHaveBeenCalled();
  expect(getByText("Applications")).toBeTruthy();
});

test("shows the empty state when there are no applications", () => {
  mockAppsState.data = [];
  const { getByText, queryByTestId } = render(<BusinessAdoptionScreen />);
  expect(getByText("No applications yet")).toBeTruthy();
  expect(queryByTestId("adoption-app-1")).toBeNull();
  expect(queryByTestId("adoption-search")).toBeNull();
});

test("shows the error state (no crash) with a retry", () => {
  mockAppsState.isError = true;
  const { getByTestId } = render(<BusinessAdoptionScreen />);
  fireEvent.press(getByTestId("adoption-retry"));
  expect(mockAppsState.refetch).toHaveBeenCalled();
});

test("groups applications by dog (a section per listing with its count)", () => {
  mockAppsState.data = [
    { ...APP_OPEN, id: 1, listing_id: 100, listing_name: "Rex" },
    { ...APP_OPEN, id: 2, listing_id: 100, listing_name: "Rex", applicant_name: "Bob" },
    { ...APP_OPEN, id: 3, listing_id: 200, listing_name: "Milo", applicant_name: "Cara" },
  ];
  const { getByTestId } = render(<BusinessAdoptionScreen />);
  expect(within(getByTestId("adoption-group-100")).getByText("2 applications")).toBeTruthy();
  expect(within(getByTestId("adoption-group-200")).getByText("1 applications")).toBeTruthy();
});

test("declined applications sort LAST within their dog group; open sort first", () => {
  mockAppsState.data = [
    { ...APP_OPEN, id: 1, status: "declined", created_at: "2026-08-20" }, // newest but declined → last
    { ...APP_OPEN, id: 2, status: "approved", created_at: "2026-08-11" },
    { ...APP_OPEN, id: 3, status: "under_review", created_at: "2026-08-10" }, // open → first
  ];
  const { getAllByTestId } = render(<BusinessAdoptionScreen />);
  const order = getAllByTestId(/^adoption-app-\d+$/).map((n) => n.props.testID);
  expect(order).toEqual(["adoption-app-3", "adoption-app-2", "adoption-app-1"]);
});

test("search filters the list; a no-match shows the empty-search state", () => {
  // Fake timers make the 200ms search debounce deterministic (no real-timer race — that flaked on
  // slower CI). Advance past the debounce and assert synchronously.
  jest.useFakeTimers();
  try {
    mockAppsState.data = [
      { ...APP_OPEN, id: 1, listing_id: 100, listing_name: "Rex", applicant_name: "Ana" },
      { ...APP_OPEN, id: 2, listing_id: 200, listing_name: "Milo", applicant_name: "Bob" },
    ];
    const { getByTestId, queryByTestId } = render(<BusinessAdoptionScreen />);

    // Type a query matching only Milo's group.
    fireEvent.changeText(getByTestId("adoption-search"), "Milo");
    act(() => jest.advanceTimersByTime(250));
    expect(queryByTestId("adoption-group-100")).toBeNull();
    expect(getByTestId("adoption-group-200")).toBeTruthy();

    // A query matching nothing → the no-matches state.
    fireEvent.changeText(getByTestId("adoption-search"), "zzz nobody");
    act(() => jest.advanceTimersByTime(250));
    expect(getByTestId("adoption-no-matches")).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

test("Approve fires the mutation with 'approved' ONLY AFTER the confirm dialog", () => {
  mockAppsState.data = [APP_OPEN];
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<BusinessAdoptionScreen />);

  fireEvent.press(getByTestId("adoption-approve-1"));
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(mockReview.mutate).not.toHaveBeenCalled();

  const confirm = alertSpy.mock.calls[0][2].find((b) => b.text === "Approve");
  confirm.onPress();

  expect(mockReview.mutate).toHaveBeenCalledTimes(1);
  expect(mockReview.mutate.mock.calls[0][0]).toEqual({ applicationId: 1, status: "approved" });
  alertSpy.mockRestore();
});

test("Decline (after confirm) fires 'declined'; Mark under review fires immediately", () => {
  mockAppsState.data = [APP_OPEN];
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<BusinessAdoptionScreen />);

  fireEvent.press(getByTestId("adoption-decline-1"));
  expect(mockReview.mutate).not.toHaveBeenCalled();
  alertSpy.mock.calls[0][2].find((b) => b.text === "Decline").onPress();
  expect(mockReview.mutate.mock.calls[0][0]).toEqual({ applicationId: 1, status: "declined" });

  fireEvent.press(getByTestId("adoption-under-review-1"));
  expect(mockReview.mutate.mock.calls[1][0]).toEqual({ applicationId: 1, status: "under_review" });
  alertSpy.mockRestore();
});

test("a decided application drops the review buttons but keeps Message", () => {
  mockAppsState.data = [{ ...APP_OPEN, id: 2, status: "approved" }];
  const { getByTestId, queryByTestId } = render(<BusinessAdoptionScreen />);
  const card = getByTestId("adoption-app-2");
  expect(within(card).getByText("Approved")).toBeTruthy();
  expect(queryByTestId("adoption-approve-2")).toBeNull();
  expect(queryByTestId("adoption-decline-2")).toBeNull();
  expect(getByTestId("adoption-message-2")).toBeTruthy(); // Message available after a decision
});

test("Message opens/reuses a thread then navigates to /provider-chat with the applicant", async () => {
  mockAppsState.data = [APP_OPEN];
  const { getByTestId } = render(<BusinessAdoptionScreen />);

  fireEvent.press(getByTestId("adoption-message-1"));
  await waitFor(() =>
    expect(mockOpenThread.mutateAsync).toHaveBeenCalledWith({ applicationId: 1 }),
  );
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/provider-chat",
      params: {
        threadId: "55",
        title: "Ana Pérez",
        meUserId: "7",
        ownerUserId: "3",
      },
    }),
  );
});

test("a 409 surfaces the 'already decided' copy instead of crashing", () => {
  mockAppsState.data = [APP_OPEN];
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<BusinessAdoptionScreen />);

  fireEvent.press(getByTestId("adoption-under-review-1"));
  const onError = mockReview.mutate.mock.calls[0][1].onError;
  onError({ status: 409, message: "nope" });

  const titles = alertSpy.mock.calls.map((c) => c[0]);
  expect(titles).toContain("Already decided");
  alertSpy.mockRestore();
});

test("the scroller is refresh-wired to the applications refetch", () => {
  mockAppsState.data = [APP_OPEN];
  const { getByTestId } = render(<BusinessAdoptionScreen />);
  expect(getByTestId("refreshable-scroll")).toBeTruthy();
  fireEvent.press(getByTestId("pull-to-refresh"));
  expect(mockAppsState.refetch).toHaveBeenCalledTimes(1);
});
