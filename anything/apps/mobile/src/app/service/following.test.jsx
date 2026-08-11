import React from "react";
import { render } from "@testing-library/react-native";

// Ticket 2.92 — "Businesses you follow" list: renders real followed providers, and an empty state
// when there are none. Hooks/router mocked so this isolates the screen.

let mockFollowedData = [];
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useFollowedProviders: () => ({ data: mockFollowedData, isLoading: false }),
}));

import FollowingBusinessesScreen from "./following";

describe("FollowingBusinessesScreen (2.92)", () => {
  it("renders the businesses the user follows", () => {
    mockFollowedData = [
      { id: 1, name: "Happy Paws", slug: "happy-paws", provider_type: "vet" },
      { id: 2, name: "Corner Pet Shop", slug: "corner", provider_type: "shop" },
    ];
    const { getByText, getAllByTestId, queryByTestId } = render(<FollowingBusinessesScreen />);
    expect(getByText("Happy Paws")).toBeTruthy();
    expect(getByText("Corner Pet Shop")).toBeTruthy();
    expect(getAllByTestId("following-row")).toHaveLength(2);
    expect(queryByTestId("following-empty")).toBeNull();
  });

  it("shows the empty state when following nobody", () => {
    mockFollowedData = [];
    const { getByTestId } = render(<FollowingBusinessesScreen />);
    expect(getByTestId("following-empty")).toBeTruthy();
  });
});
