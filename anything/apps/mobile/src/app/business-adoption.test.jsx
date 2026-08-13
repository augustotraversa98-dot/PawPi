// Business hub → Adoption applications review (ticket A2). Proves the MVP contract:
//   • lists real applications (applicant + dog + status chip + contact + answers);
//   • empty state when there are none; error state (no crash);
//   • Approve fires the review mutation with "approved" ONLY AFTER the confirm dialog;
//   • Decline (after its confirm) + Mark under review fire their statuses;
//   • a 409 surfaces the "already decided" copy instead of crashing.
// The provider hooks are mocked so the test drives the screen logic directly.
// (jest.mock factories may only reference `mock`-prefixed module vars, hence the naming.)

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, within } from "@testing-library/react-native";

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

// Applications read + review mutation (both mocked at the hook boundary).
const mockAppsState = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
const mockReview = { mutate: jest.fn(), isPending: false, boundId: null };
jest.mock("@/hooks/useProviders", () => ({
  useProviderAdoptionApplications: () => mockAppsState,
  useReviewProviderAdoptionApplication: (id) => {
    mockReview.boundId = id;
    return { mutate: mockReview.mutate, isPending: mockReview.isPending };
  },
}));

import BusinessAdoptionScreen from "./business-adoption";

const APP_OPEN = {
  id: 1,
  status: "submitted",
  created_at: "2026-08-10",
  listing_name: "Rex",
  listing_breed: "Labrador",
  applicant_name: "Ana Pérez",
  applicant_email: "ana@example.com",
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
  mockRefreshable.props = null;
});

test("lists an application with applicant, dog, status chip, contact and answers", () => {
  mockAppsState.data = [APP_OPEN];
  const { getByTestId, getByText } = render(<BusinessAdoptionScreen />);

  const card = getByTestId("adoption-app-1");
  expect(within(card).getByText("Ana Pérez")).toBeTruthy();
  expect(within(card).getByText("For: Rex · Labrador")).toBeTruthy();
  // status chip (submitted) + contact + an answer render
  expect(within(card).getByText("Submitted")).toBeTruthy();
  expect(within(card).getByText("ana@example.com")).toBeTruthy();
  expect(within(card).getByText("+54 11 5555 1234")).toBeTruthy();
  expect(within(card).getByText("We love dogs")).toBeTruthy();
  // review hook is bound to the active provider id
  expect(mockReview.boundId).toBe(8);
  // header back works
  fireEvent.press(getByTestId("adoption-back"));
  expect(mockBack).toHaveBeenCalled();
  expect(getByText("Applications")).toBeTruthy();
});

test("shows the empty state when there are no applications", () => {
  mockAppsState.data = [];
  const { getByText, queryByTestId } = render(<BusinessAdoptionScreen />);
  expect(getByText("No applications yet")).toBeTruthy();
  expect(queryByTestId("adoption-app-1")).toBeNull();
});

test("shows the error state (no crash) with a retry", () => {
  mockAppsState.isError = true;
  const { getByTestId } = render(<BusinessAdoptionScreen />);
  fireEvent.press(getByTestId("adoption-retry"));
  expect(mockAppsState.refetch).toHaveBeenCalled();
});

test("Approve fires the mutation with 'approved' ONLY AFTER the confirm dialog", () => {
  mockAppsState.data = [APP_OPEN];
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<BusinessAdoptionScreen />);

  fireEvent.press(getByTestId("adoption-approve-1"));
  // A confirm dialog is shown; the mutation has NOT fired yet.
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(mockReview.mutate).not.toHaveBeenCalled();

  // Invoke the dialog's Approve button (2nd button = confirm).
  const buttons = alertSpy.mock.calls[0][2];
  const confirm = buttons.find((b) => b.text === "Approve");
  confirm.onPress();

  expect(mockReview.mutate).toHaveBeenCalledTimes(1);
  expect(mockReview.mutate.mock.calls[0][0]).toEqual({ applicationId: 1, status: "approved" });
  alertSpy.mockRestore();
});

test("Decline (after confirm) fires 'declined'", () => {
  mockAppsState.data = [APP_OPEN];
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<BusinessAdoptionScreen />);

  fireEvent.press(getByTestId("adoption-decline-1"));
  expect(mockReview.mutate).not.toHaveBeenCalled();
  const confirm = alertSpy.mock.calls[0][2].find((b) => b.text === "Decline");
  confirm.onPress();
  expect(mockReview.mutate.mock.calls[0][0]).toEqual({ applicationId: 1, status: "declined" });
  alertSpy.mockRestore();
});

test("Mark under review fires 'under_review' immediately (no confirm)", () => {
  mockAppsState.data = [APP_OPEN];
  const { getByTestId } = render(<BusinessAdoptionScreen />);
  fireEvent.press(getByTestId("adoption-under-review-1"));
  expect(mockReview.mutate.mock.calls[0][0]).toEqual({ applicationId: 1, status: "under_review" });
});

test("a decided application drops the action buttons", () => {
  mockAppsState.data = [{ ...APP_OPEN, id: 2, status: "approved" }];
  const { getByTestId, queryByTestId } = render(<BusinessAdoptionScreen />);
  const card = getByTestId("adoption-app-2");
  expect(within(card).getByText("Approved")).toBeTruthy();
  expect(queryByTestId("adoption-approve-2")).toBeNull();
  expect(queryByTestId("adoption-decline-2")).toBeNull();
});

test("a 409 surfaces the 'already decided' copy instead of crashing", () => {
  mockAppsState.data = [APP_OPEN];
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<BusinessAdoptionScreen />);

  fireEvent.press(getByTestId("adoption-under-review-1"));
  // The review mutate was called with an onError handler; simulate a 409.
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
