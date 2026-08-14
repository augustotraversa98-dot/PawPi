import { groupFeedDayCards } from "./groupFeedDayCards";

// FF3 — grouping the feed's daily moments into DayCard items.

const moment = (over) => ({
  id: 1,
  pet_id: 10,
  user_id: 100,
  username: "tats",
  is_daily_update: true,
  post_date: "2026-08-14",
  image_url: "a.jpg",
  caption: "hi",
  created_at: "2026-08-14T10:00:00Z",
  paw_count: 1,
  bark_count: 0,
  feed_group: "following",
  ...over,
});
const regular = (over) => ({ id: 2, pet_id: 10, is_daily_update: false, ...over });

describe("groupFeedDayCards", () => {
  it("a single daily moment becomes a one-slide day card", () => {
    const out = groupFeedDayCards([moment({ id: 1 })]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("daycard");
    expect(out[0].id).toBe("daycard-10-2026-08-14");
    expect(out[0].dayCard.slides).toHaveLength(1);
    expect(out[0].dayCard.author_count).toBe(1);
    expect(out[0].dayCard.paw_count).toBe(1);
  });

  it("multiple caregivers on the same pet+day collapse into one card at the newest position", () => {
    // Feed is newest-first: the newest moment (user 200) is first.
    const out = groupFeedDayCards([
      moment({ id: 3, user_id: 200, username: "bob", created_at: "2026-08-14T18:00:00Z", paw_count: 2, bark_count: 1 }),
      moment({ id: 1, user_id: 100, username: "tats", created_at: "2026-08-14T09:00:00Z", paw_count: 1, bark_count: 0 }),
    ]);
    expect(out).toHaveLength(1);
    const card = out[0].dayCard;
    expect(card.slides).toHaveLength(2);
    expect(card.author_count).toBe(2);
    // Slides are chronological (oldest first).
    expect(card.slides.map((s) => s.post_id)).toEqual([1, 3]);
    // Day-card-level totals are summed.
    expect(card.paw_count).toBe(3);
    expect(card.bark_count).toBe(1);
    // Latest contribution = the newest slide.
    expect(card.latest_contribution_at).toBe("2026-08-14T18:00:00Z");
  });

  it("different pets or different days are separate cards", () => {
    const out = groupFeedDayCards([
      moment({ id: 1, pet_id: 10, post_date: "2026-08-14" }),
      moment({ id: 2, pet_id: 11, post_date: "2026-08-14" }),
      moment({ id: 3, pet_id: 10, post_date: "2026-08-13" }),
    ]);
    expect(out).toHaveLength(3);
    expect(out.every((i) => i.kind === "daycard")).toBe(true);
  });

  it("non-moment posts, suggestions and business posts pass through unchanged and in order", () => {
    const sugg = { kind: "provider", id: 7 };
    const biz = { item_type: "provider_post", id: 8 };
    const reg = regular({ id: 2 });
    const out = groupFeedDayCards([reg, sugg, biz, moment({ id: 1 })]);
    expect(out[0]).toBe(reg);
    expect(out[1]).toBe(sugg);
    expect(out[2]).toBe(biz);
    expect(out[3].kind).toBe("daycard");
  });

  it("is a no-op passthrough for a feed with no daily moments (no regression)", () => {
    const input = [regular({ id: 1 }), { kind: "adoption", id: 5 }, regular({ id: 2 })];
    const out = groupFeedDayCards(input);
    expect(out).toEqual(input);
  });

  it("handles a null/undefined input safely", () => {
    expect(groupFeedDayCards(null)).toEqual([]);
    expect(groupFeedDayCards(undefined)).toEqual([]);
  });
});
