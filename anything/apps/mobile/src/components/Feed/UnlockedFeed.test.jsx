import React from "react";
import { AccessibilityInfo } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { UnlockedFeed } from "./UnlockedFeed";

// Resolve t() against the real EN catalog so assertions match rendered copy.
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);

// Phase 2 ticket 2.13 — the UNLOCKED feed interleaves provider/adoption suggestion cards (a
// SEPARATE card type) between pet posts at a capped cadence. PostCard pulls in react-query via
// useTogglePaw; stub it so cards render without a QueryClient.
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

// FF3 — a pet's same-day daily moments collapse into ONE multi-caregiver DayCard in the feed.
const moment = (over) => ({
  id: 1,
  pet_id: 10,
  user_id: 100,
  username: "tats",
  pet_name: "Rex",
  pet_avatar: "https://example.com/a.jpg",
  is_daily_update: true,
  post_date: "2026-08-14",
  image_url: "https://example.com/m.jpg",
  caption: "moment",
  created_at: "2026-08-14T10:00:00Z",
  paw_count: 1,
  bark_count: 0,
  ...over,
});

describe("UnlockedFeed — FF3 day card grouping", () => {
  it("groups a pet's same-day moments into one DayCard with per-author slides", () => {
    const posts = [
      moment({ id: 2, user_id: 200, username: "bob", created_at: "2026-08-14T18:00:00Z" }),
      moment({ id: 1, user_id: 100, username: "tats", created_at: "2026-08-14T09:00:00Z" }),
    ];
    const { getAllByTestId, getByTestId } = render(
      <UnlockedFeed {...baseProps} posts={posts} suggestions={undefined} />,
    );
    // Exactly ONE day card, carrying BOTH authors' slides.
    expect(getAllByTestId("day-card")).toHaveLength(1);
    expect(getByTestId("day-card-slide-1")).toBeTruthy();
    expect(getByTestId("day-card-slide-2")).toBeTruthy();
  });

  it("does not regress non-moment posts: a regular post still renders as a normal card", () => {
    const posts = [moment({ id: 1, caption: "daycaption" }), post(99)];
    const { getByTestId, getByText, getAllByText } = render(
      <UnlockedFeed {...baseProps} posts={posts} suggestions={undefined} />,
    );
    expect(getByTestId("day-card")).toBeTruthy();
    expect(getByText(/daycaption/)).toBeTruthy(); // the day card caption
    expect(getAllByText("Pet99").length).toBeGreaterThan(0); // the regular PostCard still renders
  });

  it("tapping the day card opens the shown slide's real post", () => {
    const onOpenDetail = jest.fn();
    const posts = [moment({ id: 1 })];
    const { getByTestId } = render(
      <UnlockedFeed {...baseProps} posts={posts} onOpenDetail={onOpenDetail} suggestions={undefined} />,
    );
    fireEvent.press(getByTestId("day-card-open"));
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
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

// Regression guard (2.77 fix): after the Liquid Glass restyle, feed items had
// been wrapped in <Animated.View entering={FadeInDown…}> — which starts at
// opacity 0 — so when reanimated worklets weren't active, later posts stayed
// invisible (only the first showed; Reduce Motion ON masked it). The rule now:
// content renders at full opacity with NO entrance animation, so EVERY pet's
// post is visible regardless of the Reduce Motion setting.
describe("UnlockedFeed — all items visible regardless of motion (2.77)", () => {
  const distinctPosts = [
    { id: 1, pet_id: 11, pet_name: "Rex", username: "Ana", pet_avatar: "a", image_url: "p", caption: "rex caption" },
    { id: 2, pet_id: 22, pet_name: "Milo", username: "Bob", pet_avatar: "a", image_url: "p", caption: "milo caption" },
    { id: 3, pet_id: 33, pet_name: "Luna", username: "Cy", pet_avatar: "a", image_url: "p", caption: "luna caption" },
  ];

  afterEach(() => jest.restoreAllMocks());

  function expectAllThreeRendered() {
    const { getByText, getAllByText } = render(
      <UnlockedFeed {...baseProps} posts={distinctPosts} suggestions={undefined} />,
    );
    // Each name shows up (header + bold caption prefix), and every unique
    // caption renders — so all three pets' posts are visible, not just the first.
    expect(getAllByText("Rex").length).toBeGreaterThan(0);
    expect(getAllByText("Milo").length).toBeGreaterThan(0);
    expect(getAllByText("Luna").length).toBeGreaterThan(0);
    // Captions render as a composite Text ("<Name> <caption>"); match the
    // unique caption substring within each.
    expect(getByText(/rex caption/)).toBeTruthy();
    expect(getByText(/milo caption/)).toBeTruthy();
    expect(getByText(/luna caption/)).toBeTruthy();
  }

  it("renders every pet's post with Reduce Motion OFF", () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    expectAllThreeRendered();
  });

  it("renders every pet's post with Reduce Motion ON", () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    expectAllThreeRendered();
  });

  it("does not wrap items in a reanimated entering animation (no visibility-gating motion)", () => {
    // The fix removed the only `entering` usage in the feed. Guard against it
    // (or any opacity:0 resting style) creeping back into the rendered tree.
    const { UNSAFE_root } = render(
      <UnlockedFeed {...baseProps} posts={distinctPosts} suggestions={undefined} />,
    );
    UNSAFE_root.findAll((node) => {
      expect(node.props?.entering).toBeUndefined();
      const flat = Array.isArray(node.props?.style)
        ? Object.assign({}, ...node.props.style.filter(Boolean))
        : node.props?.style;
      if (flat && typeof flat === "object") {
        expect(flat.opacity).not.toBe(0);
      }
      return false;
    });
  });
});
