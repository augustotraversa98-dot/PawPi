// Memories & Wrapped (ticket 2.49) — pure, timezone-safe aggregation over a pet's daily
// posts + dates. Operates on canonical YYYY-MM-DD local-day strings (no Date math across
// midnight). Empty-safe: thin/young accounts get honest zeros, never fabricated stats.

function parseYMD(s) {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

const ymd = (s) => (typeof s === "string" ? s.slice(0, 10) : null);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "On this day" — past posts whose month+day match today but from a STRICTLY earlier date
 * (last year / prior months). Newest first. Each post needs a `post_date` (+ ideally
 * image_url). Returns [] when nothing matches (empty-safe).
 */
export function onThisDay(posts, today) {
  const t = parseYMD(today);
  if (!t || !Array.isArray(posts)) return [];
  return posts
    .filter((p) => {
      const d = parseYMD(p?.post_date);
      if (!d) return false;
      if (d.m !== t.m || d.d !== t.d) return false;
      // strictly earlier than today (prior year, or same year earlier — same MM-DD only
      // differs by year, so require an earlier year).
      return d.y < t.y;
    })
    .map((p) => ({ ...p, yearsAgo: t.y - parseYMD(p.post_date).y }))
    .sort((a, b) => (a.post_date < b.post_date ? 1 : -1));
}

/**
 * Longest posting streak EVER (the best consecutive-day run in history), distinct from the
 * current streak. Empty-safe → 0.
 */
export function longestStreak(postDates) {
  const days = [
    ...new Set((Array.isArray(postDates) ? postDates : []).map(ymd).filter(Boolean)),
  ].sort();
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = parseYMD(days[i - 1]);
    const cur = parseYMD(days[i]);
    const prevDt = Date.UTC(prev.y, prev.m - 1, prev.d);
    const curDt = Date.UTC(cur.y, cur.m - 1, cur.d);
    const gapDays = Math.round((curDt - prevDt) / 86400000);
    if (gapDays === 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

const STREAK_MILESTONES = [7, 30, 100, 365];
const COUNT_MILESTONES = [10, 50, 100, 365];

/**
 * Detect celebration milestones for TODAY. Empty-safe (returns []).
 *  - birthday / gotcha day (month+day match);
 *  - streak milestones (current streak EXACTLY hits 7/30/100/365);
 *  - post-count milestones (total posts EXACTLY hits 10/50/100/365).
 * Each milestone is shareable.
 *
 * @param {{birthday?, adoption_date?, name?}} pet
 * @param {{ postDates?: string[], currentStreak?: number, today: string }} ctx
 */
export function detectMilestones(pet, ctx = {}) {
  const { postDates = [], currentStreak = 0, today } = ctx;
  const t = parseYMD(today);
  const out = [];
  const name = pet?.name || "Your pet";

  if (t && pet) {
    const bd = parseYMD(pet.birthday);
    if (bd && bd.m === t.m && bd.d === t.d) {
      out.push({
        key: "birthday",
        emoji: "🎂",
        title: `Happy birthday, ${name}!`,
        subtitle: bd.y ? `${t.y - bd.y} years young today` : "Another year of joy",
        shareable: true,
      });
    }
    const ad = parseYMD(pet.adoption_date);
    if (ad && ad.m === t.m && ad.d === t.d) {
      out.push({
        key: "gotcha",
        emoji: "🏡",
        title: `${name}'s Gotcha Day!`,
        subtitle: ad.y ? `${t.y - ad.y} years together` : "The day you found each other",
        shareable: true,
      });
    }
  }

  if (STREAK_MILESTONES.includes(currentStreak)) {
    out.push({
      key: `streak-${currentStreak}`,
      emoji: "🔥",
      title: `${currentStreak}-day streak!`,
      subtitle: `${name} has posted ${currentStreak} days in a row`,
      shareable: true,
    });
  }

  const totalPosts = new Set((postDates || []).map(ymd).filter(Boolean)).size;
  if (COUNT_MILESTONES.includes(totalPosts)) {
    out.push({
      key: `posts-${totalPosts}`,
      emoji: "📸",
      title: `${totalPosts} daily moments`,
      subtitle: `${name} just hit ${totalPosts} dailies`,
      shareable: true,
    });
  }

  return out;
}

/**
 * Build the Year-in-Review / Wrapped tallies for a pet from real data. Empty-safe: returns
 * { hasEnough:false, ... } when there isn't enough to be meaningful (< 3 distinct days).
 *
 * @param {{name?}} pet
 * @param {{ postDates?: string[], today: string, friendCount?: number, walkCount?: number }} ctx
 */
export function buildWrapped(pet, ctx = {}) {
  const { postDates = [], today, friendCount = 0, walkCount = 0 } = ctx;
  const days = [
    ...new Set((Array.isArray(postDates) ? postDates : []).map(ymd).filter(Boolean)),
  ].sort();
  const name = pet?.name || "Your pet";

  if (days.length < 3) {
    return {
      hasEnough: false,
      petName: name,
      totalPosts: days.length,
      message: "Keep posting daily moments — your Wrapped unlocks as the memories grow.",
    };
  }

  // Most-active month (by post count).
  const byMonth = {};
  for (const d of days) {
    const p = parseYMD(d);
    byMonth[p.m] = (byMonth[p.m] || 0) + 1;
  }
  let topMonth = null;
  let topMonthCount = 0;
  for (const [m, c] of Object.entries(byMonth)) {
    if (c > topMonthCount) {
      topMonthCount = c;
      topMonth = MONTHS[+m - 1];
    }
  }

  const firstDay = days[0];
  const fp = parseYMD(firstDay);

  return {
    hasEnough: true,
    petName: name,
    totalPosts: days.length,
    bestStreak: longestStreak(days),
    firstPostDate: firstDay,
    firstPostLabel: fp ? `${MONTHS[fp.m - 1]} ${fp.d}, ${fp.y}` : null,
    topMonth,
    topMonthCount,
    friendCount: Math.max(0, friendCount | 0),
    walkCount: Math.max(0, walkCount | 0),
  };
}

/** The ordered Wrapped "slides" (cards) derived from buildWrapped tallies. Empty-safe. */
export function wrappedSlides(wrapped) {
  if (!wrapped || !wrapped.hasEnough) return [];
  const name = wrapped.petName;
  const slides = [
    { key: "intro", emoji: "✨", headline: `${name}'s Wrapped`, sub: "A year of little moments" },
    { key: "posts", emoji: "📸", stat: String(wrapped.totalPosts), label: "daily moments captured" },
    { key: "streak", emoji: "🔥", stat: String(wrapped.bestStreak), label: "longest posting streak" },
  ];
  if (wrapped.topMonth) {
    slides.push({ key: "month", emoji: "📅", stat: wrapped.topMonth, label: "your most-posted month" });
  }
  if (wrapped.friendCount > 0) {
    slides.push({ key: "friends", emoji: "🐾", stat: String(wrapped.friendCount), label: "furry friends made" });
  }
  if (wrapped.walkCount > 0) {
    slides.push({ key: "walks", emoji: "🚶", stat: String(wrapped.walkCount), label: "walks logged" });
  }
  if (wrapped.firstPostLabel) {
    slides.push({ key: "since", emoji: "💛", headline: "Together since", sub: wrapped.firstPostLabel });
  }
  return slides;
}
