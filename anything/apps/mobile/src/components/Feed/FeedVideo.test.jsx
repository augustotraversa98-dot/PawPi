// Daily video moments (step 4) — the inline video player: poster + tap-to-play,
// double-tap-to-Paw, and a graceful placeholder when there's no thumbnail.

import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

const mockPlayAsync = jest.fn(() => Promise.resolve());
const mockPauseAsync = jest.fn(() => Promise.resolve());

// expo-av's native Video doesn't render under jest-expo — mock it to a View that
// exposes play/pause through the ref, so we can assert playback was driven.
jest.mock("expo-av", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    ResizeMode: { COVER: "cover", CONTAIN: "contain" },
    Video: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        playAsync: mockPlayAsync,
        pauseAsync: mockPauseAsync,
      }));
      return React.createElement(View, { testID: props.testID });
    }),
  };
});

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);

import { FeedVideo } from "./FeedVideo";

beforeEach(() => {
  mockPlayAsync.mockClear();
  mockPauseAsync.mockClear();
});

it("renders the player with the video source and a play affordance when idle", () => {
  const { getByTestId } = render(
    <FeedVideo testID="vid" videoUri="v.mp4" posterUri="thumb.jpg" />,
  );
  expect(getByTestId("vid-player")).toBeTruthy();
  expect(getByTestId("vid-play")).toBeTruthy();
});

it("single tap plays the video (deferred past the double-tap window)", async () => {
  jest.useFakeTimers();
  try {
    const { getByTestId } = render(
      <FeedVideo testID="vid" videoUri="v.mp4" posterUri="thumb.jpg" />,
    );
    fireEvent.press(getByTestId("vid"));
    // Play is deferred so a double-tap can pre-empt it.
    expect(mockPlayAsync).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(mockPlayAsync).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it("double tap Paws and does NOT toggle playback", () => {
  jest.useFakeTimers();
  try {
    const onDoubleTap = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FeedVideo
        testID="vid"
        videoUri="v.mp4"
        posterUri="thumb.jpg"
        onDoubleTap={onDoubleTap}
      />,
    );
    const target = getByTestId("vid");
    fireEvent.press(target);
    fireEvent.press(target);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(mockPlayAsync).not.toHaveBeenCalled(); // play was cancelled by the 2nd tap
    expect(queryByTestId("paw-pop")).toBeTruthy(); // coral paw pop shown
  } finally {
    jest.useRealTimers();
  }
});

it("never crashes and drives no playback when there is no video_url", () => {
  jest.useFakeTimers();
  try {
    const { getByTestId, queryByTestId } = render(
      <FeedVideo testID="vid" videoUri={null} posterUri="thumb.jpg" />,
    );
    // No player mounted; the poster still shows behind the play affordance.
    expect(queryByTestId("vid-player")).toBeNull();
    fireEvent.press(getByTestId("vid"));
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(mockPlayAsync).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

it("renders a placeholder (no crash) when both video and thumbnail are missing", () => {
  const { getByTestId, queryByTestId } = render(
    <FeedVideo testID="vid" videoUri={null} posterUri={null} />,
  );
  expect(getByTestId("vid")).toBeTruthy();
  expect(queryByTestId("vid-player")).toBeNull();
});
