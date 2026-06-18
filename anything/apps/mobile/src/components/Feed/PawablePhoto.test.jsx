// Double-tap-to-Paw photo (ticket 2.64): double-tap fires onDoubleTap + shows the
// coral paw-pop; a single tap is deferred past the double-tap window then fires
// onSingleTap. expo-image + lucide are mocked to plain Views.

import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => <View {...props} /> };
});

import { PawablePhoto } from "./PawablePhoto";

test("a double tap fires onDoubleTap once and shows the paw-pop", () => {
  const onDoubleTap = jest.fn();
  const onSingleTap = jest.fn();
  const { getByTestId, queryByTestId } = render(
    <PawablePhoto
      photoUri="https://x/p.png"
      onDoubleTap={onDoubleTap}
      onSingleTap={onSingleTap}
    />,
  );

  const photo = getByTestId("pawable-photo");
  fireEvent.press(photo);
  fireEvent.press(photo);

  expect(onDoubleTap).toHaveBeenCalledTimes(1);
  expect(onSingleTap).not.toHaveBeenCalled();
  // The brand-color paw animation is mounted.
  expect(queryByTestId("paw-pop")).toBeTruthy();
});

test("a single tap fires onSingleTap after the double-tap window (no paw)", () => {
  jest.useFakeTimers();
  try {
    const onDoubleTap = jest.fn();
    const onSingleTap = jest.fn();
    const { getByTestId } = render(
      <PawablePhoto
        photoUri="https://x/p.png"
        onDoubleTap={onDoubleTap}
        onSingleTap={onSingleTap}
      />,
    );

    fireEvent.press(getByTestId("pawable-photo"));
    expect(onSingleTap).not.toHaveBeenCalled(); // deferred until the window closes
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onSingleTap).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test("disabled photo ignores taps entirely", () => {
  const onDoubleTap = jest.fn();
  const onSingleTap = jest.fn();
  const { getByTestId } = render(
    <PawablePhoto
      photoUri="https://x/p.png"
      disabled
      onDoubleTap={onDoubleTap}
      onSingleTap={onSingleTap}
    />,
  );
  const photo = getByTestId("pawable-photo");
  fireEvent.press(photo);
  fireEvent.press(photo);
  expect(onDoubleTap).not.toHaveBeenCalled();
});
