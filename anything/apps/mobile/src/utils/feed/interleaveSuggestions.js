// Phase 2 ticket 2.13 — feed integration. PURE helper that interleaves provider/adoption
// "suggestion" cards (from GET /api/feed/suggestions) between pet posts at a CONTROLLED cadence.
//
// Design (documented in the ticket + PR):
//   - Suggestions are a SEPARATE card type — every emitted suggestion item keeps its `kind`
//     discriminator ('provider' | 'adoption'). Pet posts are passed through unchanged and never
//     get a `kind`, so the renderer can never mistake one for the other (no fake pet posts).
//   - CADENCE: at most one suggestion after every N posts (CADENCE_EVERY_N), never two in a row,
//     never before the first post. A short feed (< N posts) gets ZERO suggestions.
//   - CAP: at most MAX_SUGGESTIONS suggestions are ever injected per render, regardless of how
//     many the API returned — this is the anti-spam guarantee.
//   - The post array's order/identity is preserved exactly; suggestions are only inserted
//     BETWEEN posts, so the BeReal lock and Following-first ordering are untouched.
//
// The web sibling endpoint returns { providers: [...], adoptions: [...] }; flatten + alternate
// the two sources with `flattenSuggestions` so a long feed shows a mix, not all-of-one-type.

export const CADENCE_EVERY_N = 4; // inject after every 4 posts
export const MAX_SUGGESTIONS = 3; // hard cap per render

// Alternate provider/adoption sources so the injected cards are a varied mix. Each item keeps
// its `kind`. Returns a flat, de-duped (by kind+id) list.
export function flattenSuggestions(suggestions) {
  const providers = Array.isArray(suggestions?.providers)
    ? suggestions.providers
    : [];
  const adoptions = Array.isArray(suggestions?.adoptions)
    ? suggestions.adoptions
    : [];

  const out = [];
  const seen = new Set();
  const max = Math.max(providers.length, adoptions.length);
  for (let i = 0; i < max; i++) {
    for (const item of [providers[i], adoptions[i]]) {
      if (!item) continue;
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// Interleave a flat suggestion list into the posts at the configured cadence + cap.
// Returns a flat array of mixed items: pet posts (unchanged) and suggestion items (kept whole,
// with their `kind`). Caller keys/renders by `kind`.
//
// Options let tests/callers override the cadence + cap deterministically.
export function interleaveSuggestions(
  posts,
  suggestions,
  { everyN = CADENCE_EVERY_N, max = MAX_SUGGESTIONS } = {},
) {
  const safePosts = Array.isArray(posts) ? posts : [];
  const pool = Array.isArray(suggestions)
    ? suggestions
    : flattenSuggestions(suggestions);

  // No suggestions, or cadence disabled, or feed too short for even one slot → posts as-is.
  if (pool.length === 0 || everyN < 1 || max < 1 || safePosts.length < everyN) {
    return safePosts.slice();
  }

  const out = [];
  let injected = 0;
  let nextSuggestion = 0;

  for (let i = 0; i < safePosts.length; i++) {
    out.push(safePosts[i]);

    const atCadence = (i + 1) % everyN === 0;
    const hasMore = nextSuggestion < pool.length;
    const underCap = injected < max;
    // Never inject after the very last post — a trailing card looks like an ad footer, not an
    // inline discovery. Only inject when there is at least one more post to follow it.
    const hasFollowingPost = i < safePosts.length - 1;

    if (atCadence && hasMore && underCap && hasFollowingPost) {
      out.push(pool[nextSuggestion]);
      nextSuggestion++;
      injected++;
    }
  }

  return out;
}
