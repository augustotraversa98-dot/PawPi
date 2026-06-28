// Daily-moment composer — camera-only capture. Product rule: a daily moment is a
// LIVE capture, so there is no "choose from gallery/library" path anywhere in the
// composer. The only route to a photo is launchCameraAsync; the camera-permission
// request and its friendly denied message stay. Native deps are mocked.

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockRequestCameraPerm = jest.fn();
const mockLaunchCamera = jest.fn();

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  requestCameraPermissionsAsync: (...args) => mockRequestCameraPerm(...args),
  launchCameraAsync: (...args) => mockLaunchCamera(...args),
}));

import { PostComposerModal } from "./PostComposerModal";

beforeEach(() => {
  mockRequestCameraPerm.mockReset();
  mockLaunchCamera.mockReset();
});

test("offers the camera but no gallery/library affordance", () => {
  const { getByTestId, getByText, queryByText } = render(
    <PostComposerModal visible petName="Rex" onClose={jest.fn()} onPost={jest.fn()} />,
  );
  expect(getByTestId("composer-take-photo")).toBeTruthy();
  expect(getByText("Take a photo")).toBeTruthy();
  // No way to pick an existing photo.
  expect(queryByText("Choose from gallery")).toBeNull();
  expect(queryByText("Choose from library")).toBeNull();
});

test("tapping the action opens the camera and advances to compose on capture", async () => {
  mockRequestCameraPerm.mockResolvedValue({ granted: true });
  mockLaunchCamera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///moment.jpg" }],
  });

  const { getByTestId } = render(
    <PostComposerModal visible petName="Rex" onClose={jest.fn()} onPost={jest.fn()} />,
  );

  fireEvent.press(getByTestId("composer-take-photo"));

  // It goes straight to the camera — never the library.
  await waitFor(() => expect(mockLaunchCamera).toHaveBeenCalled());
  // Once a photo is captured, the caption step appears.
  await waitFor(() => expect(getByTestId("composer-caption")).toBeTruthy());
});

test("permission-denied shows the friendly message and never opens the camera", async () => {
  mockRequestCameraPerm.mockResolvedValue({ granted: false });
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

  const { getByTestId, queryByTestId } = render(
    <PostComposerModal visible petName="Rex" onClose={jest.fn()} onPost={jest.fn()} />,
  );

  fireEvent.press(getByTestId("composer-take-photo"));

  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
    "Camera access needed",
    "Please allow camera access in settings.",
  ));
  expect(mockLaunchCamera).not.toHaveBeenCalled();
  // Stays on the picker step — no crash, no compose.
  expect(queryByTestId("composer-caption")).toBeNull();

  alertSpy.mockRestore();
});
