import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
// QR renderer stub — assert we pass the token through as its value.
jest.mock("react-native-qrcode-svg", () => {
  const { Text } = require("react-native");
  return ({ value, testID }) => <Text testID={testID}>{`qr:${value}`}</Text>;
});

let mockTokenState;
jest.mock("@/hooks/useProviders", () => ({
  useWalkPickupToken: () => mockTokenState,
}));

import WalkPickupQRModal from "./WalkPickupQRModal";

beforeEach(() => {
  mockTokenState = { data: null, isLoading: false, isError: false, refetch: jest.fn() };
});

describe("WalkPickupQRModal", () => {
  it("renders the QR with the fetched token", () => {
    mockTokenState = { data: { token: "abc.def" }, isLoading: false, isError: false, refetch: jest.fn() };
    const { getByTestId } = render(
      <WalkPickupQRModal visible petId={1} providerId={10} remaining={3} onClose={jest.fn()} />,
    );
    expect(getByTestId("walk-pickup-qr").props.children).toBe("qr:abc.def");
  });

  it("shows a spinner while loading (no QR)", () => {
    mockTokenState = { data: null, isLoading: true, isError: false, refetch: jest.fn() };
    const { queryByTestId } = render(
      <WalkPickupQRModal visible petId={1} providerId={10} onClose={jest.fn()} />,
    );
    expect(queryByTestId("walk-pickup-qr")).toBeNull();
  });

  it("offers a retry when the token failed to load", () => {
    mockTokenState = { data: null, isLoading: false, isError: true, refetch: jest.fn() };
    const { getByTestId } = render(
      <WalkPickupQRModal visible petId={1} providerId={10} onClose={jest.fn()} />,
    );
    expect(getByTestId("walk-pickup-qr-retry")).toBeTruthy();
  });
});
