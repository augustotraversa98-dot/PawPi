// Shared validation/normalization for a provider (business) post's media kind — the business-side
// mirror of the pet daily-video fields (migration 0068 → 0087). A post is an 'image' post (default,
// unchanged: body + image_urls) OR a 'video' post (media_type='video' + a playable video_url and an
// optional poster video_thumbnail_url). Used by the storefront posts create + edit routes.
//
// Returns { ok: true, media_type, video_url, video_thumbnail_url } on success (video fields are
// always null for an image post), or { ok: false, error } with a plain-English message for a 400.

const asTrimmedString = (v) => (typeof v === "string" ? v.trim() : "");

export function normalizeProviderPostMedia(body) {
  const raw = body ?? {};
  const mediaType = raw.media_type == null ? "image" : raw.media_type;

  if (mediaType !== "image" && mediaType !== "video") {
    return { ok: false, error: "Invalid media type" };
  }

  if (mediaType === "video") {
    const videoUrl = asTrimmedString(raw.video_url);
    if (videoUrl.length === 0) {
      return { ok: false, error: "A video post needs a video" };
    }
    const thumb = asTrimmedString(raw.video_thumbnail_url);
    return {
      ok: true,
      media_type: "video",
      video_url: videoUrl,
      video_thumbnail_url: thumb.length > 0 ? thumb : null,
    };
  }

  // Image post: the video columns are always null.
  return {
    ok: true,
    media_type: "image",
    video_url: null,
    video_thumbnail_url: null,
  };
}
