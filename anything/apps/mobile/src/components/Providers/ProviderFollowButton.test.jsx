import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

// Ticket 2.92 — the Follow/Following toggle: optimistic flip via the toggle mutation, guest is
// prompted to sign in, follower count shows. Hooks + auth are mocked so this isolates the button.

const mockToggle = jest.fn();
const mockAuthState = { isAuthenticated: true, signIn: jest.fn() };
let mockFollowData = { following: false, followersCount: 0 };

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => mockAuthState }));
jest.mock("@/hooks/useProviders", () => ({
  useProviderFollow: () => ({ data: mockFollowData }),
  useToggleProviderFollow: () => ({ mutate: mockToggle, isPending: false }),
}));

import ProviderFollowButton from "./ProviderFollowButton";

beforeEach(() => {
  mockToggle.mockClear();
  mockAuthState.isAuthenticated = true;
  mockAuthState.signIn = jest.fn();
  mockFollowData = { following: false, followersCount: 0 };
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("ProviderFollowButton (2.92)", () => {
  it("a signed-in owner taps Follow → calls the toggle with the current (not-following) state", () => {
    const { getByTestId, getByText } = render(<ProviderFollowButton providerId={5} />);
    expect(getByText("storefront.follow.follow")).toBeTruthy();
    fireEvent.press(getByTestId("provider-follow-button"));
    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockToggle.mock.calls[0][0]).toEqual({ following: false });
  });

  it("shows the Following label when already following; the follower COUNT is not here (ticket 2.93 → stat row)", () => {
    mockFollowData = { following: true, followersCount: 12 };
    const { getByText, queryByTestId } = render(<ProviderFollowButton providerId={5} />);
    expect(getByText("storefront.follow.following")).toBeTruthy();
    // The count moved to the Posts-tab stat row — the button no longer renders it.
    expect(queryByTestId("provider-follower-count")).toBeNull();
  });

  it("a guest is prompted to sign in and does NOT toggle", () => {
    mockAuthState.isAuthenticated = false;
    const { getByTestId } = render(<ProviderFollowButton providerId={5} />);
    fireEvent.press(getByTestId("provider-follow-button"));
    expect(Alert.alert).toHaveBeenCalled();
    expect(mockToggle).not.toHaveBeenCalled();
  });
});
