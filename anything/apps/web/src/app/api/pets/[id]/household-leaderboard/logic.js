// E13 PR3 — the household leaderboard ranking (pure, positive-only).
//
// CELEBRATE the family, never shame a co-parent. This ranks members by real contribution and names the
// most-active caregiver — but it emits NO "least active" / "you did the least" signal. Everyone who
// contributed is celebrated; a zero-contribution member is simply un-ranked, never called out. Keeping
// this pure makes the "never shame" guarantee unit-testable.

/**
 * Rank household members by total contribution (desc). Tags exactly one `most_active` — the top member,
 * only when they actually contributed (total > 0) AND there is a clear-or-shared lead. Returns
 * { members: [...sorted, with rank], most_active_user_id }. Never flags anyone as least/low.
 */
export function rankHousehold(members = []) {
  const sorted = [...members].sort((a, b) => (b.total || 0) - (a.total || 0));
  const ranked = sorted.map((m, i) => ({ ...m, rank: i + 1 }));

  const top = ranked[0];
  const mostActive = top && (top.total || 0) > 0 ? top.member_user_id : null;

  return { members: ranked, most_active_user_id: mostActive };
}
