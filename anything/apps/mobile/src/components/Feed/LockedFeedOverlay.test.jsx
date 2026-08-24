// LockedFeedOverlay — the "post to unlock" FOMO tease (feed polish #4).
// Product-critical: when locked, the feed is a SCROLLABLE, blurred list showing
// WHO posted (clear identity) but not WHAT (blurred photo + obscured caption).
// Every post renders (no cap — you can scroll the whole tease), and each card
// carries a rotating, name-aware FOMO CTA. There is no pinned floating lock card
// and no social-proof header card — those were replaced by the per-card CTAs.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { LockedFeedOverlay } from "./LockedFeedOverlay";

// Resolve t() against the real EN catalog so assertions match rendered copy.
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);

// PostCard pulls in react-query via useTogglePaw; stub it so the preview cards
// render without a QueryClient.
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
// PostCard now imports expo-av (FeedVideo); its native module doesn't load under
// jest-expo, so mock it to a plain View. These tests only use image posts.
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    Video: (props) => <View testID={props.testID} />,
    ResizeMode: { COVER: "cover" },
  };
});

const post = (id) => ({
  id,
  pet_name: `Pet${id}`,
  pet_handle: `pet${id}`,
  username: "Owner",
  pet_avatar: "https://example.com/a.jpg",
  image_url: "https://example.com/p.jpg",
  caption: "moment",
});

describe("LockedFeedOverlay — scrollable blurred FOMO feed", () => {
  it("renders EVERY post (no cap — the whole tease is scrollable)", () => {
    const posts = Array.from({ length: 12 }, (_, i) => post(i + 1));
    const { getAllByTestId } = render(
      <LockedFeedOverlay posts={posts} petName="Rex" onPostPress={() => {}} />,
    );
    // The enclosing ScrollView scrolls the whole locked feed, so all cards render.
    expect(getAllByTestId("feed-post-photo")).toHaveLength(12);
  });

  it("shows a name-aware FOMO CTA on each locked card", () => {
    const { getAllByTestId, getByText } = render(
      <LockedFeedOverlay posts={[post(1), post(2)]} petName="Rex" onPostPress={() => {}} />,
    );
    expect(getAllByTestId("feed-post-locked-cta")).toHaveLength(2);
    // The CTA names the poster's pet (real identity, never fabricated content).
    expect(getByText(/what Pet1/)).toBeTruthy();
  });

  it("keeps each card's identity visible but obscures the caption", () => {
    const { getByText, getAllByTestId, queryByText } = render(
      <LockedFeedOverlay posts={[post(1)]} petName="Rex" onPostPress={() => {}} />,
    );
    // Identity (pet name, @handle, owner) stays clear…
    expect(getByText("Pet1")).toBeTruthy();
    expect(getByText("@pet1")).toBeTruthy();
    expect(getByText("by Owner")).toBeTruthy();
    // …the caption text is hidden (replaced by an obscured placeholder bar).
    expect(queryByText("moment")).toBeNull();
    expect(getAllByTestId("feed-post-caption-locked")).toHaveLength(1);
  });

  it("renders no social-proof header card and no inline CTA over the feed", () => {
    const { queryByText } = render(
      <LockedFeedOverlay posts={[post(1), post(2)]} petName="Rex" onPostPress={() => {}} />,
    );
    // The social-proof header card and its CTA are gone — the lock card is a
    // separate, pinned overlay (LockedFloatingCard), not part of this content.
    expect(queryByText(/pet friends? shared today/)).toBeNull();
    expect(queryByText("Post today's photo")).toBeNull();
  });

  it("tapping a locked card opens the composer (nudge to post)", () => {
    const onPostPress = jest.fn();
    const { getAllByTestId } = render(
      <LockedFeedOverlay posts={[post(1)]} petName="Rex" onPostPress={onPostPress} />,
    );
    fireEvent.press(getAllByTestId("feed-post-photo")[0]);
    expect(onPostPress).toHaveBeenCalledTimes(1);
  });

  it("shows the 'be the first' empty state + CTA with no posts (no crash, no scrim)", () => {
    const onPostPress = jest.fn();
    const { queryAllByTestId, getByText } = render(
      <LockedFeedOverlay posts={[]} petName="Rex" onPostPress={onPostPress} />,
    );
    expect(queryAllByTestId("feed-post-photo")).toHaveLength(0); // nothing to preview
    expect(getByText("No pet friends have posted yet")).toBeTruthy();
    fireEvent.press(getByText("Post today's photo"));
    expect(onPostPress).toHaveBeenCalledTimes(1);
  });

  it("tolerates a missing posts prop without crashing", () => {
    const { getByText } = render(
      <LockedFeedOverlay posts={undefined} petName="Rex" onPostPress={() => {}} />,
    );
    // Falls through to the empty 'be the first' state.
    expect(getByText("No pet friends have posted yet")).toBeTruthy();
  });
});
