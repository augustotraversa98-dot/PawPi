// The birthday highlight in the Feed: a post from a dog whose birthday is today (device date) gets the
// coral frame + 🎂; every other post renders normally; nothing to do with notifications.

import React from "react";
import fs from "fs";
import path from "path";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { COLORS } from "@/constants/theme";
import { PostCard } from "./PostCard";
import { DayCard } from "./DayCard";
import { UnlockedFeed } from "./UnlockedFeed";
import { LockedFeedOverlay } from "./LockedFeedOverlay";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return { __esModule: true, Video: (props) => <View testID={props.testID} />, ResizeMode: { COVER: "cover" } };
});
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
  presentNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));
// The DEVICE's local day.
let mockToday = "2026-06-18";
jest.mock("@/utils/dateUtils", () => ({
  ...jest.requireActual("@/utils/dateUtils"),
  getLocalPostDateString: () => mockToday,
}));

beforeEach(() => {
  mockToday = "2026-06-18";
  global.fetch = jest.fn();
});

const post = (over = {}) => ({
  id: 1,
  pet_id: 7,
  pet_name: "Phoebe",
  pet_avatar: "https://example.com/a.jpg",
  image_url: "https://example.com/p.jpg",
  caption: "hi",
  pet_birthday_md: "06-18",
  pet_birthday: "9996-06-18",
  ...over,
});

// The card's outer surface: the first host view carrying a border width.
const frame = (view) => {
  const find = (node) => {
    if (!node || typeof node !== "object") return null;
    const style = StyleSheet.flatten(node.props?.style);
    if (style?.borderWidth != null) return style;
    for (const child of node.children ?? []) {
      const hit = find(child);
      if (hit) return hit;
    }
    return null;
  };
  return find(view.toJSON());
};

describe("a single post", () => {
  it("birthday today: coral frame, 🎂 with its label, ribbon, and no age (the year is never sent)", () => {
    const view = render(<PostCard post={post()} />);
    expect(view.getByText("🎂")).toBeTruthy();
    expect(view.getByLabelText("Birthday")).toBeTruthy();
    expect(view.getByText("🎂 Phoebe's Birthday")).toBeTruthy();
    expect(view.queryByText(/year/i)).toBeNull();
    expect(frame(view)).toMatchObject({ borderWidth: 2.5, borderColor: COLORS.coral });
  });

  it.each([
    ["another day", { pet_birthday_md: "06-19", pet_birthday: "9996-06-19" }],
    ["no birthday", { pet_birthday_md: null, pet_birthday: null }],
    ["a server that sends no birthday at all", { pet_birthday_md: undefined, pet_birthday: undefined }],
  ])("%s: renders normally", (_label, over) => {
    const view = render(<PostCard post={post(over)} />);
    expect(view.queryByText("🎂")).toBeNull();
    expect(view.queryByText(/Birthday/)).toBeNull();
    expect(frame(view).borderWidth).toBe(1);
  });

  it("an older server (full date only) still highlights, with the age", () => {
    const view = render(
      <PostCard post={post({ pet_birthday_md: undefined, pet_birthday: "2020-06-18T00:00:00.000Z" })} />,
    );
    expect(view.getByText("🎂")).toBeTruthy();
    expect(view.getByText(/6 years/)).toBeTruthy();
  });

  it.each([
    ["2027-02-28", true],
    ["2027-03-01", false],
    ["2028-02-28", false],
    ["2028-02-29", true],
  ])("a Feb 29 birthday on %s → %s", (day, expected) => {
    mockToday = day;
    const view = render(<PostCard post={post({ pet_birthday_md: "02-29", pet_birthday: "9996-02-29" })} />);
    expect(view.queryByText("🎂") != null).toBe(expected);
  });

  it("locked: frame and 🎂 show, the photo stays blurred, no ribbon", () => {
    const view = render(<PostCard post={post()} locked />);
    expect(view.getByText("🎂")).toBeTruthy();
    expect(view.getByTestId("feed-post-locked-blur")).toBeTruthy();
    expect(view.queryByText("🎂 Phoebe's Birthday")).toBeNull();
    expect(frame(view).borderWidth).toBe(2.5);
  });

  it("video post: the player is still there under the highlight", () => {
    const view = render(
      <PostCard
        post={post({
          media_type: "video",
          image_url: null,
          video_url: "https://example.com/v.mp4",
          video_thumbnail_url: "https://example.com/t.jpg",
        })}
      />,
    );
    expect(view.getByText("🎂")).toBeTruthy();
    expect(view.getByTestId("feed-post-video")).toBeTruthy();
  });
});

describe("in the feed", () => {
  const noop = () => {};
  const props = { likedPosts: {}, onToggleLike: noop, onOpenBarks: noop, onOpenDetail: noop, onOpenProfile: noop };
  const business = { id: 90, item_type: "provider_post", provider: { name: "Happy Vet" }, body: "Open today", image_urls: [] };

  it("only the birthday dog's posts (every one of them) are highlighted; a business post is untouched", () => {
    const posts = [
      post({ id: 1 }),
      post({ id: 2 }),
      post({ id: 3, pet_id: 8, pet_name: "Coco", pet_birthday_md: "01-01", pet_birthday: "9996-01-01" }),
      business,
    ];
    const view = render(<UnlockedFeed {...props} posts={posts} />);
    expect(view.getAllByText("🎂")).toHaveLength(2);
    expect(view.getAllByText("Happy Vet").length).toBeGreaterThan(0);
  });

  it("the locked feed highlights it too", () => {
    const view = render(<LockedFeedOverlay posts={[post(), business]} petName="Rex" onPostPress={noop} />);
    expect(view.getAllByText("🎂")).toHaveLength(1);
  });
});

describe("a day with several moments (DayCard)", () => {
  const slide = (id, over) => ({ post_id: id, image_url: "a.png", author: { id }, _post: post({ id, ...over }) });
  const card = (over) => ({ pet: { name: "Phoebe" }, author_count: 2, slides: [slide(1, over), slide(2, over)] });

  it("birthday today: coral frame, 🎂 and ribbon", () => {
    const view = render(<DayCard dayCard={card()} />);
    expect(view.getByLabelText("Birthday")).toBeTruthy();
    expect(view.getByText("🎂 Phoebe's Birthday")).toBeTruthy();
    expect(frame(view)).toMatchObject({ borderWidth: 2.5, borderColor: COLORS.coral });
  });

  it("any other day: renders normally", () => {
    mockToday = "2026-06-19";
    const view = render(<DayCard dayCard={card()} />);
    expect(view.queryByText(/🎂/)).toBeNull();
    expect(frame(view).borderWidth).toBe(1);
  });
});

describe("no notifications", () => {
  it("showing a birthday post schedules and sends nothing, and calls no server", () => {
    render(<PostCard post={post()} />);
    for (const fn of Object.values(Notifications)) {
      if (jest.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled();
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("none of the birthday highlight code imports notification code", () => {
    const files = [
      "PostCard.jsx",
      "DayCard.jsx",
      "MilestoneRibbon.jsx",
      "Confetti.jsx",
      "../../utils/feedDelight.js",
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, file), "utf8");
      const imports = source.match(/(?:from\s+|require\()\s*["'][^"']+["']/g) ?? [];
      expect(imports.filter((line) => /notif/i.test(line))).toEqual([]);
    }
  });
});
