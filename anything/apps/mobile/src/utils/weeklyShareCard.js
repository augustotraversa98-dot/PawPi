// "Rex's Week" share card — what goes on the card, decided from REAL digest data only.
//
//  • Image: one of the week's real daily moments. Fallback order — the moment the owner picked,
//    the digest's best moment, the week's most recent moment, the pet's profile photo, and finally
//    NO image at all (the screen then asks for a daily moment). The brand paw is never a "photo".
//  • Copy: positive and honest. A stat line only mentions stats that are > 0; a week with nothing in
//    it gets a warm non-numeric line instead of "0 walks · 0/7 ring days". Nothing is invented.

export function momentPhoto(m) {
  return m?.photo_url || m?.image_url || null;
}

function byRecency(a, b) {
  const da = String(a.post_date || "");
  const db = String(b.post_date || "");
  if (da !== db) return da < db ? 1 : -1;
  return (Number(b.post_id) || 0) - (Number(a.post_id) || 0);
}

// The week's moments that actually have a photo, newest first.
export function weekMomentList(moments) {
  return (Array.isArray(moments) ? moments : [])
    .filter((m) => momentPhoto(m))
    .slice()
    .sort(byRecency);
}

// -> { source: "chosen" | "best" | "recent" | "profile" | "none", uri, momentId }
export function resolveShareImage({ moments, bestMoment, selectedId, avatarUrl } = {}) {
  const list = weekMomentList(moments);

  const chosen = selectedId != null ? list.find((m) => m.post_id === selectedId) : null;
  if (chosen) return { source: "chosen", uri: momentPhoto(chosen), momentId: chosen.post_id };

  const bestUri = momentPhoto(bestMoment);
  if (bestUri) return { source: "best", uri: bestUri, momentId: bestMoment.post_id ?? null };

  if (list.length > 0) {
    return { source: "recent", uri: momentPhoto(list[0]), momentId: list[0].post_id };
  }
  if (avatarUrl) return { source: "profile", uri: avatarUrl, momentId: null };
  return { source: "none", uri: null, momentId: null };
}

// Positive stat line from the real counts, or null when there is nothing true and positive to say.
// Walks, ring days and daily moments lead; care actions only speak up when nothing else does.
export function buildShareStatLine(data, t) {
  const walks = Number(data?.walks) || 0;
  const ringClosed = Number(data?.ring_days_closed) || 0;
  const ringTotal = Number(data?.ring_days_total) || 7;
  const moments = Number(data?.moments) || 0;
  const care = Number(data?.care_actions) || 0;

  const parts = [];
  if (walks > 0) parts.push(t("weeklyDigest.shareWalks", { count: walks }));
  if (ringClosed > 0) {
    parts.push(t("weeklyDigest.shareRingDays", { closed: ringClosed, total: ringTotal }));
  }
  if (moments > 0) parts.push(t("weeklyDigest.shareMoments", { count: moments }));
  if (parts.length === 0 && care > 0) {
    parts.push(t("weeklyDigest.shareCare", { count: care }));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

// The ShareableMemoryCard props for the week, or null when there is no real image to put on it.
export function buildWeeklyShareCard({ data, name, image, t }) {
  if (!image?.uri) return null;
  return {
    headline: t("weeklyDigest.shareHeadline", { name }),
    subtitle: buildShareStatLine(data, t) || t("weeklyDigest.shareFreshWeek"),
    photoUri: image.uri,
  };
}
