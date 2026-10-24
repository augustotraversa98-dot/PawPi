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

  it("tapping a locked card's pet name opens THAT post's pet profile, not the composer", () => {
    const onPostPress = jest.fn();
    const onOpenProfile = jest.fn();
    const { getByText } = render(
      <LockedFeedOverlay
        posts={[post(1), post(2)]}
        petName="Rex"
        onPostPress={onPostPress}
        onOpenProfile={onOpenProfile}
      />,
    );
    fireEvent.press(getByText("Pet2"));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 2, pet_handle: "pet2" }));
    expect(onPostPress).not.toHaveBeenCalled();
  });

  describe("business posts are public — never locked", () => {
    const bizPost = {
      id: 1,
      provider_id: 3,
      item_type: "provider_post",
      body: "Weekend grooming specials",
      image_urls: ["https://example.com/b.jpg"],
      media_type: "image",
      created_at: "2026-10-20T10:00:00Z",
      provider: {
        id: 3,
        name: "Happy Paws Grooming",
        slug: "happy-paws",
        logo_url: "https://example.com/logo.png",
      },
      paw_count: 2,
      comment_count: 1,
    };

    it("renders a business post unlocked with its name + caption, while a pet post stays locked", () => {
      const { getByText, getAllByText, getAllByTestId, queryByText } = render(
        <LockedFeedOverlay
          posts={[bizPost, post(2)]}
          petName="Rex"
          onPostPress={() => {}}
        />,
      );
      // Business: name and caption are visible, no locked headline for it.
      expect(getAllByText("Happy Paws Grooming").length).toBeGreaterThan(0);
      expect(getByText(/Weekend grooming specials/)).toBeTruthy();
      expect(getAllByTestId("business-post-card")).toHaveLength(1);
      // Pet post: still locked (one CTA / one obscured caption — not two).
      expect(getAllByTestId("feed-post-locked-cta")).toHaveLength(1);
      expect(getAllByTestId("feed-post-caption-locked")).toHaveLength(1);
      expect(queryByText("moment")).toBeNull();
    });

    it("tapping a business post opens it via onOpenBusinessPost, not the composer", () => {
      const onPostPress = jest.fn();
      const onOpenBusinessPost = jest.fn();
      const { getByTestId } = render(
        <LockedFeedOverlay
          posts={[bizPost]}
          petName="Rex"
          onPostPress={onPostPress}
          onOpenBusinessPost={onOpenBusinessPost}
        />,
      );
      fireEvent.press(getByTestId("business-post-card"));
      expect(onOpenBusinessPost).toHaveBeenCalledWith(bizPost);
      expect(onPostPress).not.toHaveBeenCalled();
    });

    it("business posts don't consume a rotating CTA slot (first locked pet card still gets CTA #0)", () => {
      const { getByText } = render(
        <LockedFeedOverlay
          posts={[bizPost, post(2)]}
          petName="Rex"
          onPostPress={() => {}}
        />,
      );
      expect(getByText(/what Pet2/)).toBeTruthy();
    });
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
