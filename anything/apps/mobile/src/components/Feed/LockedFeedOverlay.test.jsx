// LockedFeedOverlay — the BeReal-style "post to unlock" tease (2.77 fix).
// Product-critical: when locked, the user MUST still see other pets' posts
// (heavily blurred but clearly present) behind the lock card — that's the whole
// incentive to post. A redesign regression made the scrim opaque so the locked
// feed looked EMPTY. These tests pin that the preview is non-empty.

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
  username: "Owner",
  pet_avatar: "https://example.com/a.jpg",
  image_url: "https://example.com/p.jpg",
  caption: "moment",
});

describe("LockedFeedOverlay — visible blurred preview", () => {
  it("renders the preview posts behind the lock (not an empty feed)", () => {
    const posts = [post(1), post(2), post(3)];
    const { getAllByTestId, getByText } = render(
      <LockedFeedOverlay posts={posts} petName="Rex" onPostPress={() => {}} />,
    );

    // Every provided post shows in the preview — the tease is non-empty.
    expect(getAllByTestId("feed-post-photo")).toHaveLength(3);
    // …and the lock CTA is present over it.
    expect(getByText("Post today's photo")).toBeTruthy();
  });

  it("caps the preview so the area fills but does not render the whole feed", () => {
    const posts = Array.from({ length: 12 }, (_, i) => post(i + 1));
    const { getAllByTestId } = render(
      <LockedFeedOverlay posts={posts} petName="Rex" onPostPress={() => {}} />,
    );
    // Enough to fill behind the card (6), not all 12.
    expect(getAllByTestId("feed-post-photo")).toHaveLength(6);
  });

  it("fires onPostPress from the unlock CTA", () => {
    const onPostPress = jest.fn();
    const { getByText } = render(
      <LockedFeedOverlay posts={[post(1)]} petName="Rex" onPostPress={onPostPress} />,
    );
    fireEvent.press(getByText("Post today's photo"));
    expect(onPostPress).toHaveBeenCalledTimes(1);
  });

  it("the preview is NOT dimmed to near-invisible (blur/wash obscures, not opacity)", () => {
    // Guard the specific regression: the preview wrapper must not be rendered at
    // a tiny opacity (the old 0.35 made posts vanish under the scrim). Any post
    // photo in the tree must sit at full opacity.
    const { UNSAFE_root } = render(
      <LockedFeedOverlay posts={[post(1), post(2)]} petName="Rex" onPostPress={() => {}} />,
    );
    UNSAFE_root.findAll((node) => {
      const flat = Array.isArray(node.props?.style)
        ? Object.assign({}, ...node.props.style.filter(Boolean))
        : node.props?.style;
      if (flat && typeof flat === "object" && typeof flat.opacity === "number") {
        expect(flat.opacity).toBeGreaterThan(0.5);
      }
      return false;
    });
  });
});
