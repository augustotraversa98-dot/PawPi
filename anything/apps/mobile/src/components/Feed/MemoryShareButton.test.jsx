// Memory / Wrapped share (ticket 2.49 + 2.62 fix): reuses the load-gated capture.
// A photo slide is snapshotted only after its hero image decodes; a stat/emoji
// slide (no photo) is ready as soon as it lays out.

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
import { MemoryShareButton } from "./MemoryShareButton";

beforeEach(() => {
  jest.clearAllMocks();
  captureRef.mockResolvedValue("file://memory.png");
  Sharing.isAvailableAsync.mockResolvedValue(true);
  Sharing.shareAsync.mockResolvedValue();
});

test("a photo slide captures only after its image loads, then shares", async () => {
  const { getByTestId } = render(
    <MemoryShareButton petName="Buddy" card={{ photoUri: "https://x/m.png" }} />,
  );

  fireEvent.press(getByTestId("memory-share"));
  expect(captureRef).not.toHaveBeenCalled();

  fireEvent(getByTestId("memory-card-image"), "load");

  await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  expect(Sharing.shareAsync.mock.calls[0][1].dialogTitle).toContain("Buddy");
});

test("a stat slide (no photo) captures as soon as it lays out", async () => {
  const { getByTestId } = render(
    <MemoryShareButton
      petName="Buddy"
      card={{ stat: "365", statLabel: "days together" }}
    />,
  );

  fireEvent.press(getByTestId("memory-share"));
  // No image to wait for — ready on layout.
  fireEvent(getByTestId("shareable-memory-card"), "layout", {
    nativeEvent: { layout: { width: 360, height: 640 } },
  });
  await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
});

test("a photo that errors fails gracefully — no capture, no crash", async () => {
  const { getByTestId, queryByTestId } = render(
    <MemoryShareButton petName="Buddy" card={{ photoUri: "https://x/m.png" }} />,
  );

  fireEvent.press(getByTestId("memory-share"));
  fireEvent(getByTestId("memory-card-image"), "error");

  await waitFor(() => expect(queryByTestId("memory-capture-card")).toBeNull());
  expect(captureRef).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
