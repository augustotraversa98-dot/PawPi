// LockedFeedOverlay — the BeReal-style "post to unlock" tease (2.77 redesign).
// Product-critical: when locked, the feed must be a SCROLLABLE tease showing
// WHO posted (clear identity) but not WHAT (blurred photo + obscured caption),
// with a social-proof header and an unlock CTA. The earlier design capped the
// preview at 6 and covered it with an opaque scrim, so the feed read as empty
// and couldn't scroll. These tests pin the new behavior.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { LockedFeedOverlay } from "./LockedFeedOverlay";

// PostCard pulls in react-query via useTogglePaw; stub it so the preview cards
// render without a QueryClient.
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const post = (id) => ({
  id,
  pet_name: `Pet${id}`,
  pet_handle: `pet${id}`,
  username: "Owner",
  pet_avatar: "https://example.com/a.jpg",
  image_url: "https://example.com/p.jpg",
  caption: "moment",
});

describe("LockedFeedOverlay — scrollable blurred tease", () => {
  it("renders EVERY returned post (no 6-post cap)", () => {
    const posts = Array.from({ length: 12 }, (_, i) => post(i + 1));
    const { getAllByTestId } = render(
      <LockedFeedOverlay posts={posts} petName="Rex" onPostPress={() => {}} />,
    );
    // All 12 cards render — the feed scrolls through the whole query, uncapped.
    expect(getAllByTestId("feed-post-photo")).toHaveLength(12);
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

  it("shows the social-proof header counting the posts", () => {
    const posts = [post(1), post(2), post(3)];
    const { getByText } = render(
      <LockedFeedOverlay posts={posts} petName="Rex" onPostPress={() => {}} />,
    );
    expect(getByText("3 pet friends shared today")).toBeTruthy();
    expect(getByText(/Post Rex's daily moment to see their day/)).toBeTruthy();
  });

  it("singularizes the social-proof header with exactly one post", () => {
    const { getByText } = render(
      <LockedFeedOverlay posts={[post(1)]} petName="Rex" onPostPress={() => {}} />,
    );
    expect(getByText("1 pet friend shared today")).toBeTruthy();
  });

  it("fires onPostPress from the inline unlock CTA", () => {
    const onPostPress = jest.fn();
    const { getByText } = render(
      <LockedFeedOverlay posts={[post(1)]} petName="Rex" onPostPress={onPostPress} />,
    );
    fireEvent.press(getByText("Post today's photo"));
    expect(onPostPress).toHaveBeenCalledTimes(1);
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
