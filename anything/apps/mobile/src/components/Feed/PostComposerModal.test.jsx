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
// expo-av's native module isn't available under jest — stub Video to a plain
// View so the compose-step video preview renders (and forwards its testID).
jest.mock("expo-av", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    ResizeMode: { COVER: "cover", CONTAIN: "contain" },
    Video: (props) => React.createElement(View, props),
  };
});

import { PostComposerModal } from "./PostComposerModal";

// The composer fetches GET /api/posts/video-eligibility on open. Default to
// NOT eligible (photo-only); the video tests override this per-test.
beforeEach(() => {
  mockRequestCameraPerm.mockReset();
  mockLaunchCamera.mockReset();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ eligible: false, date: "2026-06-28" }),
  });
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

test("no video option for a non-eligible user (photo-only)", async () => {
  // Default beforeEach fetch already returns eligible:false.
  const { getByTestId, queryByTestId } = render(
    <PostComposerModal visible petName="Rex" onClose={jest.fn()} onPost={jest.fn()} />,
  );
  // Let the eligibility fetch resolve.
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(getByTestId("composer-take-photo")).toBeTruthy();
  expect(queryByTestId("composer-take-video")).toBeNull();
});

test("a failed eligibility fetch stays photo-only (never blocks)", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
  const { getByTestId, queryByTestId } = render(
    <PostComposerModal visible petName="Rex" onClose={jest.fn()} onPost={jest.fn()} />,
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(getByTestId("composer-take-photo")).toBeTruthy();
  expect(queryByTestId("composer-take-video")).toBeNull();
});

test("eligible user can record a video → previews it and posts media_type 'video'", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ eligible: true, date: "2026-06-28" }),
  });
  mockRequestCameraPerm.mockResolvedValue({ granted: true });
  mockLaunchCamera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///moment.mov" }],
  });
  const onPost = jest.fn();

  const { getByTestId, getByText } = render(
    <PostComposerModal visible petName="Rex" onClose={jest.fn()} onPost={onPost} />,
  );

  // The video affordance appears only after eligibility resolves true.
  await waitFor(() => expect(getByTestId("composer-take-video")).toBeTruthy());

  fireEvent.press(getByTestId("composer-take-video"));

  // Records a video (<=15s, videos media type), then shows the video preview.
  await waitFor(() => expect(mockLaunchCamera).toHaveBeenCalled());
  expect(mockLaunchCamera).toHaveBeenCalledWith(
    expect.objectContaining({ mediaTypes: ["videos"], videoMaxDuration: 15 }),
  );
  await waitFor(() => expect(getByTestId("composer-video-preview")).toBeTruthy());

  // Posting hands the uri + video media type up to the feed hook.
  fireEvent.press(getByText("Post daily update 🐾"));
  expect(onPost).toHaveBeenCalledWith({
    uri: "file:///moment.mov",
    caption: "",
    mediaType: "video",
  });
});
