// Business "daily moments" + video — the feed card for a followed business's post. It renders an
// image post OR the inline FeedVideo player for a video post, shows paw/comment counts, and taps
// through to the provider-post detail (the feed screen maps the press → the handoff + route).

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => <View {...props} /> };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k, opts) => (opts?.count != null ? `${k}:${opts.count}` : k),
  }),
}));
// expo-av's native Video doesn't render under jest-expo — mock to a View exposing the testID.
jest.mock("expo-av", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    ResizeMode: { COVER: "cover", CONTAIN: "contain" },
    Video: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        playAsync: jest.fn(() => Promise.resolve()),
        pauseAsync: jest.fn(() => Promise.resolve()),
      }));
      return React.createElement(View, { testID: props.testID });
    }),
  };
});

import { BusinessPostCard } from "./BusinessPostCard";

const imagePost = {
  id: 7,
  provider_id: 3,
  item_type: "provider_post",
  body: "Fresh grooming slots today",
  image_urls: ["https://cdn/a.png"],
  media_type: "image",
  created_at: "2026-08-12T10:00:00Z",
  provider: { id: 3, name: "Happy Paws", slug: "happy-paws", logo_url: "https://cdn/logo.png" },
  paw_count: 4,
  comment_count: 2,
};

const videoPost = {
  ...imagePost,
  id: 8,
  image_urls: [],
  media_type: "video",
  video_url: "https://cdn/moment.mp4",
  video_thumbnail_url: "https://cdn/moment.jpg",
};

test("renders an image business post with the business identity + counts", () => {
  const { getByTestId, getByText, getAllByText, queryByTestId } = render(
    <BusinessPostCard post={imagePost} onPress={jest.fn()} />,
  );
  // Name appears in the header and again as the bold caption prefix.
  expect(getAllByText(/Happy Paws/).length).toBeGreaterThanOrEqual(1);
  expect(getByTestId("business-post-photo")).toBeTruthy();
  expect(queryByTestId("business-post-video")).toBeNull();
  // Paw + comment counts surface (comment key carries the interpolated count).
  expect(getByText(/4 storefront.social.paws/)).toBeTruthy();
  expect(getByText("storefront.comments.countOther:2")).toBeTruthy();
});

test("renders a video business post with the inline FeedVideo player (not an image)", () => {
  const { getByTestId, queryByTestId } = render(
    <BusinessPostCard post={videoPost} onPress={jest.fn()} />,
  );
  expect(getByTestId("business-post-video")).toBeTruthy();
  expect(getByTestId("business-post-video-player")).toBeTruthy(); // the mocked expo-av Video
  expect(queryByTestId("business-post-photo")).toBeNull();
});

test("tapping the card opens the detail (onPress fired)", () => {
  const onPress = jest.fn();
  const { getByTestId } = render(
    <BusinessPostCard post={imagePost} onPress={onPress} />,
  );
  fireEvent.press(getByTestId("business-post-card"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("tapping the image also opens the detail", () => {
  const onPress = jest.fn();
  const { getByTestId } = render(
    <BusinessPostCard post={imagePost} onPress={onPress} />,
  );
  fireEvent.press(getByTestId("business-post-photo"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
