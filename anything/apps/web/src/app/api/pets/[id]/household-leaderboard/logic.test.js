// E13 PR3 — the household ranking celebrates the family and NEVER shames a co-parent.
import { describe, it, expect } from "vitest";
import { rankHousehold } from "./logic";

describe("rankHousehold — positive only", () => {
  it("ranks by total desc and names the most-active member", () => {
    const r = rankHousehold([
      { member_user_id: 1, total: 3 },
      { member_user_id: 2, total: 12 },
      { member_user_id: 3, total: 7 },
    ]);
    expect(r.members.map((m) => m.member_user_id)).toEqual([2, 3, 1]);
    expect(r.members[0].rank).toBe(1);
    expect(r.most_active_user_id).toBe(2);
  });

  it("emits NO most-active when nobody contributed (never a shame frame)", () => {
    const r = rankHousehold([
      { member_user_id: 1, total: 0 },
      { member_user_id: 2, total: 0 },
    ]);
    expect(r.most_active_user_id).toBeNull();
  });

  it("never tags a member as least/low — only an optional most_active", () => {
    const r = rankHousehold([
      { member_user_id: 1, total: 5 },
      { member_user_id: 2, total: 0 },
    ]);
    // The zero member is present + ranked, but carries no negative flag.
    const low = r.members.find((m) => m.member_user_id === 2);
    expect(low).toBeTruthy();
    expect(low).not.toHaveProperty("least_active");
    expect(low).not.toHaveProperty("shame");
    expect(r.most_active_user_id).toBe(1);
  });

  it("does not mutate the input", () => {
    const input = [{ member_user_id: 1, total: 1 }];
    rankHousehold(input);
    expect(input[0]).not.toHaveProperty("rank");
  });
});
