import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { UnlockedFeed } from "./UnlockedFeed";

// Phase 2 ticket 2.13 — the UNLOCKED feed interleaves provider/adoption suggestion cards (a
// SEPARATE card type) between pet posts at a capped cadence. PostCard pulls in react-query via
// useTogglePaw; stub it so cards render without a QueryClient.
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

const noop = () => {};
const baseProps = {
  likedPosts: {},
  onToggleLike: noop,
  onOpenBarks: noop,
  onOpenDetail: noop,
  onOpenProfile: noop,
};

describe("UnlockedFeed — interleaved suggestion cards", () => {
  it("renders distinct provider + adoption cards between posts (discriminated, not pet posts)", () => {
    // 9 posts → two cadence slots (after #4 and #8), each filled by a suggestion.
    const posts = Array.from({ length: 9 }, (_, i) => post(i + 1));
    const suggestions = {
      providers: [{ kind: "provider", id: 100, name: "Happy Paws", provider_type: "vet" }],
      adoptions: [{ kind: "adoption", id: 200, name: "Rex", provider_name: "Shelter X" }],
    };

    const { getByTestId, getByText } = render(
      <UnlockedFeed {...baseProps} posts={posts} suggestions={suggestions} />,
    );

    // Both distinct card types are present, with their unmistakable eyebrows.
    expect(getByTestId("provider-feed-card")).toBeTruthy();
    expect(getByTestId("adoption-feed-card")).toBeTruthy();
    expect(getByText("DISCOVER A BUSINESS")).toBeTruthy();
    expect(getByText("ADOPT ME")).toBeTruthy();
  });

  it("a short feed shows NO suggestion cards (cadence not reached)", () => {
    const posts = [post(1), post(2)];
    const suggestions = {
      providers: [{ kind: "provider", id: 100, name: "Happy Paws" }],
      adoptions: [],
    };

    const { queryByTestId } = render(
      <UnlockedFeed {...baseProps} posts={posts} suggestions={suggestions} />,
    );

    expect(queryByTestId("provider-feed-card")).toBeNull();
    expect(queryByTestId("adoption-feed-card")).toBeNull();
  });

  it("tapping a provider card opens the provider; tapping adoption opens adoption", () => {
    const posts = Array.from({ length: 9 }, (_, i) => post(i + 1));
    const suggestions = {
      providers: [{ kind: "provider", id: 100, slug: "happy-paws", name: "Happy Paws" }],
      adoptions: [{ kind: "adoption", id: 200, name: "Rex" }],
    };
    const onOpenProvider = jest.fn();
    const onOpenAdoption = jest.fn();

    const { getByTestId } = render(
      <UnlockedFeed
        {...baseProps}
        posts={posts}
        suggestions={suggestions}
        onOpenProvider={onOpenProvider}
        onOpenAdoption={onOpenAdoption}
      />,
    );

    fireEvent.press(getByTestId("provider-feed-card"));
    fireEvent.press(getByTestId("adoption-feed-card"));
    expect(onOpenProvider).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "happy-paws" }),
    );
    expect(onOpenAdoption).toHaveBeenCalledWith(
      expect.objectContaining({ id: 200 }),
    );
  });

  it("with no suggestions, renders only pet posts (existing behavior unchanged)", () => {
    const posts = Array.from({ length: 6 }, (_, i) => post(i + 1));

    const { queryByTestId, getByText } = render(
      <UnlockedFeed {...baseProps} posts={posts} suggestions={undefined} />,
    );

    expect(queryByTestId("provider-feed-card")).toBeNull();
    expect(queryByTestId("adoption-feed-card")).toBeNull();
    expect(getByText("PET FRIENDS' MOMENTS")).toBeTruthy();
  });
});

// Ticket 2.58 — the "Suggested for you" divider at the Following→Suggested boundary.
const fpost = (id, group) => ({ ...post(id), feed_group: group });

describe("UnlockedFeed — Suggested divider (2.58)", () => {
  it("renders the divider before the first suggested post when following content is above it", () => {
    const posts = [fpost(1, "following"), fpost(2, "following"), fpost(3, "suggested"), fpost(4, "suggested")];
    const { getByTestId } = render(<UnlockedFeed {...baseProps} posts={posts} suggestions={undefined} />);
    expect(getByTestId("suggested-divider")).toBeTruthy();
  });

  it("does NOT render the divider when there is no suggested content", () => {
    const posts = [fpost(1, "following"), fpost(2, "following")];
    const { queryByTestId } = render(<UnlockedFeed {...baseProps} posts={posts} suggestions={undefined} />);
    expect(queryByTestId("suggested-divider")).toBeNull();
  });

  it("does NOT render a dangling divider when the whole feed is suggested (no following above)", () => {
    const posts = [fpost(1, "suggested"), fpost(2, "suggested")];
    const { queryByTestId } = render(<UnlockedFeed {...baseProps} posts={posts} suggestions={undefined} />);
    expect(queryByTestId("suggested-divider")).toBeNull();
  });
});
