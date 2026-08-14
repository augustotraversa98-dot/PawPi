import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

let mockPermission;
const mockRequest = jest.fn();
jest.mock("expo-camera", () => {
  const { View } = require("react-native");
  return {
    CameraView: (props) => <View testID="pickup-camera" {...props} />,
    useCameraPermissions: () => [mockPermission, mockRequest],
  };
});

import PickupScannerModal from "./PickupScannerModal";

beforeEach(() => {
  mockPermission = { granted: true, canAskAgain: true };
  mockRequest.mockReset();
});

describe("PickupScannerModal", () => {
  it("renders the camera when permission is granted", () => {
    const { getByTestId } = render(
      <PickupScannerModal visible onClose={jest.fn()} onScanned={jest.fn()} />,
    );
    expect(getByTestId("pickup-camera")).toBeTruthy();
  });

  it("calls onScanned with the scanned QR data", () => {
    const onScanned = jest.fn();
    const { getByTestId } = render(
      <PickupScannerModal visible onClose={jest.fn()} onScanned={onScanned} />,
    );
    const cam = getByTestId("pickup-camera");
    cam.props.onBarcodeScanned({ data: "abc.def" });
    expect(onScanned).toHaveBeenCalledWith("abc.def");
  });

  it("does not scan while busy (onBarcodeScanned disabled)", () => {
    const onScanned = jest.fn();
    const { getByTestId } = render(
      <PickupScannerModal visible busy onClose={jest.fn()} onScanned={onScanned} />,
    );
    expect(getByTestId("pickup-camera").props.onBarcodeScanned).toBeUndefined();
  });

  it("calls onClose when the close (X) control is pressed", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <PickupScannerModal visible onClose={onClose} onScanned={jest.fn()} />,
    );
    fireEvent.press(getByTestId("pickup-scanner-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the denied state + an enable button when permission is not granted", () => {
    mockPermission = { granted: false, canAskAgain: true };
    const { getByTestId } = render(
      <PickupScannerModal visible onClose={jest.fn()} onScanned={jest.fn()} />,
    );
    fireEvent.press(getByTestId("pickup-scanner-grant"));
    expect(mockRequest).toHaveBeenCalled();
  });
});
