// Daily shareable frame (ticket 2.28 + 2.62 fix): pressing Share mounts the
// off-screen ShareableDailyCard and snapshots it — but only AFTER the hero photo
// has finished loading, so the frame contains the real image, not a blank center.
// view-shot + expo-sharing are auto-mocked (root __mocks__). expo-image is mocked
// as a plain View that forwards onLoad/onError so tests can simulate image events.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  // Forward all props (incl. onLoad/onError) so fireEvent(node,'load'|'error') works.
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

test("capture is deferred until the image reports loaded, then shares the image + text", async () => {
  const { getByTestId } = render(
    <DailyShareButton petName="Buddy" photoUri="https://x/p.png" />,
  );

  fireEvent.press(getByTestId("daily-share"));
  // The off-screen card is mounted, but the photo hasn't loaded yet — no capture.
  expect(captureRef).not.toHaveBeenCalled();

  // Image finishes decoding → NOW we snapshot.
  fireEvent(getByTestId("share-card-image"), "load");

  await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  const [uri, opts] = Sharing.shareAsync.mock.calls[0];
  expect(uri).toBe("file://capture.png");
  expect(opts.dialogTitle).toContain("Buddy");
});

test("never captures while the photoUri is missing (card never mounts)", () => {
  const { getByTestId, queryByTestId } = render(
    <DailyShareButton petName="Buddy" photoUri={undefined} />,
  );
  fireEvent.press(getByTestId("daily-share"));
  expect(queryByTestId("share-capture-card")).toBeNull();
  expect(captureRef).not.toHaveBeenCalled();
});

test("an image load error fails gracefully — no blank share, no crash", async () => {
  const { getByTestId, queryByTestId } = render(
    <DailyShareButton petName="Buddy" photoUri="https://x/p.png" />,
  );

  fireEvent.press(getByTestId("daily-share"));
  fireEvent(getByTestId("share-card-image"), "error");

  // No capture, no share — and the off-screen card is torn down.
  await waitFor(() => expect(queryByTestId("share-capture-card")).toBeNull());
  expect(captureRef).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
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
