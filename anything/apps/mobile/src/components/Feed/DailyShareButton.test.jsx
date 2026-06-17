// Daily shareable frame (ticket 2.28): pressing Share snapshots the off-screen
// ShareableDailyCard and opens the system share sheet with the image + enhanced text.
// view-shot + expo-sharing are auto-mocked (root __mocks__). The frame renders the real
// pet name. Locked posts never capture/share.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => <View {...props} /> };
});

import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { DailyShareButton, shareCaption } from "./DailyShareButton";
import ShareableDailyCard from "./ShareableDailyCard";

beforeEach(() => {
  jest.clearAllMocks();
  captureRef.mockResolvedValue("file://capture.png");
  Sharing.isAvailableAsync.mockResolvedValue(true);
  Sharing.shareAsync.mockResolvedValue();
});

test("the frame renders the real pet name + brand tagline", () => {
  const { getByText } = render(
    <ShareableDailyCard petName="Buddy" photoUri="https://x/p.png" />,
  );
  expect(getByText("Buddy is part of PawPi 🐾")).toBeTruthy();
});

test("Share captures the card and opens the share sheet with the image + text", async () => {
  const { getByTestId } = render(
    <DailyShareButton petName="Buddy" photoUri="https://x/p.png" />,
  );

  fireEvent.press(getByTestId("daily-share"));
  // Pressing mounts the off-screen capture card; its layout triggers capture+share.
  fireEvent(getByTestId("share-capture-card"), "layout", {
    nativeEvent: { layout: { width: 360, height: 640 } },
  });

  await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  const [uri, opts] = Sharing.shareAsync.mock.calls[0];
  expect(uri).toBe("file://capture.png");
  expect(opts.dialogTitle).toContain("Buddy");
});

test("a locked post never captures or shares", () => {
  const { getByTestId, queryByTestId } = render(
    <DailyShareButton petName="Buddy" photoUri="https://x/p.png" locked />,
  );
  fireEvent.press(getByTestId("daily-share"));
  expect(queryByTestId("share-capture-card")).toBeNull();
  expect(captureRef).not.toHaveBeenCalled();
});

test("shareCaption includes the pet name", () => {
  expect(shareCaption("Buddy")).toContain("Buddy");
  expect(shareCaption()).toContain("my pup");
});
